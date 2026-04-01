import { readTokens, writeTokens, withTokenLock } from './storage.js';
import type { OAuthTokenData } from '../types/manifest.js';

/** Stores a plain token (api_key/bearer) for a specific tool */
export async function saveToken(toolName: string, token: string): Promise<void> {
  await withTokenLock(async () => {
    const tokens = await readTokens();
    tokens[toolName] = token;
    await writeTokens(tokens);
  });
}

/** Stores OAuth2 token data for a specific tool */
export async function saveOAuthToken(toolName: string, data: OAuthTokenData): Promise<void> {
  await withTokenLock(async () => {
    const tokens = await readTokens();
    tokens[toolName] = data;
    await writeTokens(tokens);
  });
}

/** Retrieves the access token string for a tool, or null if not found.
 *  For OAuth2 tokens, returns the access_token field. */
export async function getToken(toolName: string): Promise<string | null> {
  const tokens = await readTokens();
  const entry = tokens[toolName];
  if (entry === undefined) return null;
  if (typeof entry === 'string') return entry;
  return entry.access_token;
}

/** Retrieves the full OAuth2 token data, or null if not found or not an OAuth2 token */
export async function getOAuthTokenData(toolName: string): Promise<OAuthTokenData | null> {
  const tokens = await readTokens();
  const entry = tokens[toolName];
  if (entry === undefined || typeof entry === 'string') return null;
  return entry;
}

/** Removes the stored token for a tool. Returns true if it existed. */
export async function removeToken(toolName: string): Promise<boolean> {
  return withTokenLock(async () => {
    const tokens = await readTokens();
    if (!(toolName in tokens)) return false;
    delete tokens[toolName];
    await writeTokens(tokens);
    return true;
  });
}

/** Checks whether a token exists for a tool */
export async function hasToken(toolName: string): Promise<boolean> {
  const tokens = await readTokens();
  return toolName in tokens;
}

/** Checks whether an OAuth2 token is expired (with 60s buffer) */
export function isTokenExpired(data: OAuthTokenData): boolean {
  if (!data.expires_at) return false;
  return Date.now() >= (data.expires_at - 60) * 1000;
}
