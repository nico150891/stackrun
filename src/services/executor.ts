import axios, { AxiosError } from 'axios';
import type { ToolManifest, ToolCommand } from '../types/manifest.js';
import { getOAuthTokenData, isTokenExpired, saveOAuthToken } from './auth.js';
import { refreshAccessToken } from './oauth.js';

export interface ExecuteOptions {
  manifest: ToolManifest;
  command: ToolCommand;
  params: Record<string, string>;
  token: string | null;
}

export interface ExecuteResult {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

/** Executes an HTTP call based on a manifest command definition */
export async function executeCommand(options: ExecuteOptions): Promise<ExecuteResult> {
  const { manifest, command, params } = options;
  let { token } = options;

  // Auto-refresh expired OAuth2 tokens
  if (manifest.auth.type === 'oauth2' && token) {
    token = await maybeRefreshToken(manifest, token);
  }

  // Build path with param replacement
  let path = command.path;
  const queryParams: Record<string, string> = {};
  let body: Record<string, string> | undefined;

  if (command.params) {
    for (const paramDef of command.params) {
      const value = params[paramDef.name];
      if (value === undefined && paramDef.required) {
        throw new Error(`Missing required parameter: ${paramDef.name}`);
      }
      if (value === undefined) continue;

      switch (paramDef.location) {
        case 'path':
          path = path.replace(`:${paramDef.name}`, encodeURIComponent(value));
          break;
        case 'query':
          queryParams[paramDef.name] = value;
          break;
        case 'body':
          if (!body) body = {};
          body[paramDef.name] = value;
          break;
      }
    }
  }

  // Also pass through any params not defined in the manifest as query params
  // This allows flexibility for undocumented API params
  if (command.params) {
    const definedNames = new Set(command.params.map((p) => p.name));
    for (const [key, value] of Object.entries(params)) {
      if (!definedNames.has(key)) {
        queryParams[key] = value;
      }
    }
  } else {
    // No params defined — all user params go to query
    Object.assign(queryParams, params);
  }

  const url = `${manifest.base_url}${path}`;

  // Merge headers: tool-level + command-level (command wins) + auth
  const headers: Record<string, string> = {
    ...(manifest.headers ?? {}),
    ...(command.headers ?? {}),
  };

  if (token && manifest.auth.type !== 'none') {
    if (manifest.auth.type === 'oauth2') {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (manifest.auth.header) {
      const prefix = manifest.auth.prefix ? `${manifest.auth.prefix} ` : '';
      headers[manifest.auth.header] = `${prefix}${token}`;
    }
  }

  try {
    const response = await axios.request({
      method: command.method,
      url,
      headers,
      params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      data: body,
      // Disable redirects for authenticated requests to prevent token leaking to HTTP
      maxRedirects: token ? 0 : 5,
    });

    return {
      status: response.status,
      headers: response.headers as Record<string, string>,
      data: response.data,
    };
  } catch (err) {
    if (err instanceof AxiosError && err.response) {
      const status = err.response.status;
      throw new HttpApiError(status, formatHttpError(status, manifest.name, path), err.response.data);
    }
    if (err instanceof AxiosError) {
      if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
        throw new Error(`Could not reach ${manifest.name} API. Check your internet connection.`);
      }
      if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        throw new Error(`Request to ${manifest.name} API timed out. Try again later.`);
      }
      throw new Error(`Network error calling ${manifest.name} API: ${err.message}`);
    }
    throw err;
  }
}

/** Custom error class for HTTP API errors with status and response data */
export class HttpApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly responseData: unknown,
  ) {
    super(message);
    this.name = 'HttpApiError';
  }
}

/** Checks if an OAuth2 token is expired and refreshes it if possible */
async function maybeRefreshToken(manifest: ToolManifest, currentToken: string): Promise<string> {
  const oauthData = await getOAuthTokenData(manifest.name);
  if (!oauthData) return currentToken;
  if (!isTokenExpired(oauthData)) return currentToken;

  if (!oauthData.refresh_token || !manifest.auth.token_url) {
    throw new HttpApiError(
      401,
      `Token expired for ${manifest.name}. Run: stackrun login ${manifest.name}`,
      null,
    );
  }

  const clientId = manifest.auth.client_id ?? process.env.STACKRUN_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error(`Cannot refresh token: no client_id. Run: stackrun login ${manifest.name}`);
  }

  const newData = await refreshAccessToken(
    manifest.auth.token_url,
    oauthData.refresh_token,
    clientId,
    process.env.STACKRUN_OAUTH_CLIENT_SECRET,
  );

  await saveOAuthToken(manifest.name, newData);
  return newData.access_token;
}

/** Maps HTTP status codes to user-friendly messages */
function formatHttpError(status: number, toolName: string, path: string): string {
  switch (status) {
    case 401:
      return `Authentication failed. Run: stackrun login ${toolName}`;
    case 403:
      return `Access denied to ${toolName}${path}. Check your permissions.`;
    case 404:
      return `Endpoint not found: ${path}`;
    case 429: {
      return `Rate limited by ${toolName}. Try again later.`;
    }
    default:
      if (status >= 500) {
        return `${toolName} API error (${status}). Try again later.`;
      }
      return `${toolName} API returned ${status} for ${path}`;
  }
}
