import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';
import axios from 'axios';
import type { AuthConfig, OAuthTokenData } from '../types/manifest.js';

export interface OAuthFlowOptions {
  toolName: string;
  auth: AuthConfig;
  /** Override client_id (e.g. from env var STACKRUN_OAUTH_CLIENT_ID) */
  clientId?: string;
  /** Override client_secret (e.g. from env var STACKRUN_OAUTH_CLIENT_SECRET) */
  clientSecret?: string;
  /** Port for the local callback server (0 = random) */
  port?: number;
  /** Timeout in ms for the browser flow (default: 120000) */
  timeout?: number;
  /** Called with the auth URL once the callback server is ready. Open the browser here. */
  onAuthUrl?: (url: string) => void;
}

/**
 * Runs the OAuth2 authorization code flow:
 * 1. Starts a local HTTP server to receive the callback
 * 2. Calls onAuthUrl with the authorization URL (caller opens browser)
 * 3. Waits for the redirect with the auth code
 * 4. Exchanges the code for tokens
 */
export async function runOAuthFlow(options: OAuthFlowOptions): Promise<OAuthTokenData> {
  const { auth } = options;
  const timeout = options.timeout ?? 120_000;

  if (!auth.auth_url || !auth.token_url) {
    throw new Error(`OAuth2 configuration incomplete: missing auth_url or token_url`);
  }

  const clientId = options.clientId ?? auth.client_id;
  if (!clientId) {
    throw new Error(
      `No client_id found. Set STACKRUN_OAUTH_CLIENT_ID or include client_id in the manifest.`,
    );
  }

  const state = randomBytes(16).toString('hex');

  // Step 1: start local callback server
  const callbackServer = await startCallbackServer(options.port ?? 0, state, timeout);
  const redirectUri = `http://localhost:${callbackServer.port}/callback`;

  // Step 2: build auth URL and notify caller
  const authUrl = buildAuthUrl({ auth, clientId, redirectUri, state });
  if (options.onAuthUrl) {
    options.onAuthUrl(authUrl);
  }

  try {
    // Step 3: wait for callback with auth code
    const code = await callbackServer.waitForCode();

    // Step 4: exchange code for tokens
    const tokenData = await exchangeCodeForToken({
      tokenUrl: auth.token_url,
      code,
      redirectUri,
      clientId,
      clientSecret: options.clientSecret,
    });

    return tokenData;
  } finally {
    callbackServer.server.close();
  }
}

/** Builds the authorization URL that the user opens in the browser */
export function buildAuthUrl(options: {
  auth: AuthConfig;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const { auth, clientId, redirectUri, state } = options;
  const url = new URL(auth.auth_url!);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  if (auth.scopes && auth.scopes.length > 0) {
    url.searchParams.set('scope', auth.scopes.join(' '));
  }
  return url.toString();
}

interface CallbackServer {
  server: Server;
  port: number;
  waitForCode: () => Promise<string>;
}

/** Starts a local HTTP server and returns a promise that resolves when the OAuth callback arrives */
async function startCallbackServer(
  port: number,
  expectedState: string,
  timeout: number,
): Promise<CallbackServer> {
  return new Promise((resolveServer, rejectServer) => {
    let resolveCode: (code: string) => void;
    let rejectCode: (err: Error) => void;

    let settled = false;
    let storedResult: { ok: true; value: string } | { ok: false; error: Error } | null = null;
    let notify: (() => void) | null = null;

    resolveCode = (code: string) => {
      if (settled) return;
      settled = true;
      storedResult = { ok: true, value: code };
      notify?.();
    };
    rejectCode = (err: Error) => {
      if (settled) return;
      settled = true;
      storedResult = { ok: false, error: err };
      notify?.();
    };

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`);

      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      if (error) {
        const desc = url.searchParams.get('error_description') ?? error;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(errorPage(desc));
        rejectCode(new Error(`OAuth2 authorization denied: ${desc}`));
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(errorPage('Missing authorization code'));
        return;
      }

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(errorPage('State mismatch — possible CSRF attack'));
        rejectCode(new Error('OAuth2 state mismatch'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(successPage());
      resolveCode(code);
    });

    const timer = setTimeout(() => {
      server.close();
      rejectCode(new Error(`OAuth2 flow timed out after ${timeout / 1000}s. No callback received.`));
    }, timeout);

    const waitForCode = (): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        if (storedResult) {
          clearTimeout(timer);
          if (storedResult.ok) resolve(storedResult.value);
          else reject(storedResult.error);
          return;
        }
        notify = () => {
          clearTimeout(timer);
          if (storedResult!.ok) resolve(storedResult!.value);
          else reject(storedResult!.error);
        };
      });

    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolveServer({
        server,
        port: actualPort,
        waitForCode,
      });
    });

    server.on('error', (err) => {
      clearTimeout(timer);
      rejectServer(err);
    });
  });
}

/** Exchanges an authorization code for access and refresh tokens */
async function exchangeCodeForToken(options: {
  tokenUrl: string;
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
}): Promise<OAuthTokenData> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: options.clientId,
  });

  if (options.clientSecret) {
    body.set('client_secret', options.clientSecret);
  }

  const response = await axios.post(options.tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = response.data;

  const tokenData: OAuthTokenData = {
    access_token: data.access_token,
    token_type: data.token_type ?? 'Bearer',
  };

  if (data.refresh_token) {
    tokenData.refresh_token = data.refresh_token;
  }

  if (data.expires_in) {
    tokenData.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
  }

  return tokenData;
}

/** Refreshes an OAuth2 access token using a refresh token */
export async function refreshAccessToken(
  tokenUrl: string,
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
): Promise<OAuthTokenData> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const response = await axios.post(tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const data = response.data;

  const tokenData: OAuthTokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? refreshToken,
    token_type: data.token_type ?? 'Bearer',
  };

  if (data.expires_in) {
    tokenData.expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
  }

  return tokenData;
}

function successPage(): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px">
<h1>&#10003; Authorization successful</h1>
<p>You can close this tab and return to the terminal.</p>
</body></html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui;text-align:center;padding:60px">
<h1>&#10007; Authorization failed</h1>
<p>${message}</p>
</body></html>`;
}
