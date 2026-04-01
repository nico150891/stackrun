import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import type { OAuthTokenData, AuthConfig } from '../../src/types/manifest.js';

// Mock homedir for storage isolation
const mockHomeDir = vi.fn<() => string>();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockHomeDir() };
});

const { saveOAuthToken, getToken, getOAuthTokenData, isTokenExpired } = await import(
  '../../src/services/auth.js'
);
const { ensureConfigDir } = await import('../../src/services/storage.js');
const { validateManifest } = await import('../../src/services/validator.js');
const { buildAuthUrl, runOAuthFlow } = await import('../../src/services/oauth.js');

describe('OAuth2', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-oauth-'));
    mockHomeDir.mockReturnValue(tempDir);
    await ensureConfigDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('Auth Service — OAuth token storage', () => {
    it('should save and retrieve OAuth token data', async () => {
      const data: OAuthTokenData = {
        access_token: 'ya29.access',
        refresh_token: 'refresh_123',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'Bearer',
      };
      await saveOAuthToken('google', data);

      // getToken returns the access_token string
      const token = await getToken('google');
      expect(token).toBe('ya29.access');

      // getOAuthTokenData returns the full object
      const full = await getOAuthTokenData('google');
      expect(full).toEqual(data);
    });

    it('should return null for getOAuthTokenData on plain string tokens', async () => {
      const { saveToken } = await import('../../src/services/auth.js');
      await saveToken('stripe', 'sk_test_123');

      const oauthData = await getOAuthTokenData('stripe');
      expect(oauthData).toBeNull();

      // getToken still works for plain strings
      const token = await getToken('stripe');
      expect(token).toBe('sk_test_123');
    });

    it('should return null for getOAuthTokenData on nonexistent tool', async () => {
      const oauthData = await getOAuthTokenData('nonexistent');
      expect(oauthData).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for token without expires_at', () => {
      expect(isTokenExpired({ access_token: 'test' })).toBe(false);
    });

    it('should return false for non-expired token', () => {
      const data: OAuthTokenData = {
        access_token: 'test',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      };
      expect(isTokenExpired(data)).toBe(false);
    });

    it('should return true for expired token', () => {
      const data: OAuthTokenData = {
        access_token: 'test',
        expires_at: Math.floor(Date.now() / 1000) - 100,
      };
      expect(isTokenExpired(data)).toBe(true);
    });

    it('should return true within 60s buffer', () => {
      const data: OAuthTokenData = {
        access_token: 'test',
        expires_at: Math.floor(Date.now() / 1000) + 30,
      };
      expect(isTokenExpired(data)).toBe(true);
    });
  });

  describe('Validator — OAuth2 auth type', () => {
    const baseManifest = {
      name: 'test-tool',
      version: '1.0.0',
      description: 'Test',
      base_url: 'https://api.example.com',
      commands: [
        { name: 'test_cmd', method: 'GET', path: '/test', description: 'Test' },
      ],
    };

    it('should accept valid oauth2 config', () => {
      const errors = validateManifest({
        ...baseManifest,
        auth: {
          type: 'oauth2',
          auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_url: 'https://oauth2.googleapis.com/token',
          scopes: ['email', 'profile'],
        },
      });
      expect(errors).toHaveLength(0);
    });

    it('should reject oauth2 without auth_url', () => {
      const errors = validateManifest({
        ...baseManifest,
        auth: {
          type: 'oauth2',
          token_url: 'https://oauth2.googleapis.com/token',
          scopes: ['email'],
        },
      });
      expect(errors.some((e) => e.field === 'auth.auth_url')).toBe(true);
    });

    it('should reject oauth2 without token_url', () => {
      const errors = validateManifest({
        ...baseManifest,
        auth: {
          type: 'oauth2',
          auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
          scopes: ['email'],
        },
      });
      expect(errors.some((e) => e.field === 'auth.token_url')).toBe(true);
    });

    it('should reject oauth2 without scopes', () => {
      const errors = validateManifest({
        ...baseManifest,
        auth: {
          type: 'oauth2',
          auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
          token_url: 'https://oauth2.googleapis.com/token',
        },
      });
      expect(errors.some((e) => e.field === 'auth.scopes')).toBe(true);
    });

    it('should reject non-HTTPS auth_url', () => {
      const errors = validateManifest({
        ...baseManifest,
        auth: {
          type: 'oauth2',
          auth_url: 'http://accounts.google.com/auth',
          token_url: 'https://oauth2.googleapis.com/token',
          scopes: ['email'],
        },
      });
      expect(errors.some((e) => e.field === 'auth.auth_url')).toBe(true);
    });
  });

  describe('buildAuthUrl', () => {
    it('should build a valid authorization URL', () => {
      const auth: AuthConfig = {
        type: 'oauth2',
        auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_url: 'https://oauth2.googleapis.com/token',
        scopes: ['email', 'profile'],
      };

      const url = buildAuthUrl({
        auth,
        clientId: 'test-client-id',
        redirectUri: 'http://localhost:9999/callback',
        state: 'abc123',
      });

      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://accounts.google.com');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('client_id')).toBe('test-client-id');
      expect(parsed.searchParams.get('redirect_uri')).toBe('http://localhost:9999/callback');
      expect(parsed.searchParams.get('state')).toBe('abc123');
      expect(parsed.searchParams.get('scope')).toBe('email profile');
    });

    it('should omit scope when scopes array is empty', () => {
      const auth: AuthConfig = {
        type: 'oauth2',
        auth_url: 'https://auth.example.com/authorize',
        token_url: 'https://auth.example.com/token',
        scopes: [],
      };

      const url = buildAuthUrl({
        auth,
        clientId: 'client',
        redirectUri: 'http://localhost:9999/callback',
        state: 'xyz',
      });

      const parsed = new URL(url);
      expect(parsed.searchParams.has('scope')).toBe(false);
    });
  });

  describe('runOAuthFlow', () => {
    it('should throw if auth_url is missing', async () => {
      await expect(
        runOAuthFlow({
          toolName: 'test',
          auth: { type: 'oauth2', token_url: 'https://token.example.com/token', scopes: [] },
          clientId: 'test',
          timeout: 1000,
        }),
      ).rejects.toThrow('missing auth_url or token_url');
    });

    it('should throw if no client_id is provided', async () => {
      await expect(
        runOAuthFlow({
          toolName: 'test',
          auth: {
            type: 'oauth2',
            auth_url: 'https://auth.example.com/auth',
            token_url: 'https://auth.example.com/token',
            scopes: [],
          },
          timeout: 1000,
        }),
      ).rejects.toThrow('No client_id found');
    });

    it('should complete flow with mock token server', async () => {
      // Start a mock token endpoint
      const tokenServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: 'mock_access_token',
              refresh_token: 'mock_refresh_token',
              expires_in: 3600,
              token_type: 'Bearer',
            }),
          );
        });
      });

      await new Promise<void>((resolve) => tokenServer.listen(0, '127.0.0.1', resolve));
      const tokenPort = (tokenServer.address() as { port: number }).port;

      try {
        let capturedAuthUrl: string | undefined;

        const flowPromise = runOAuthFlow({
          toolName: 'test',
          auth: {
            type: 'oauth2',
            auth_url: 'https://auth.example.com/authorize',
            token_url: `http://localhost:${tokenPort}/token`,
            scopes: ['read'],
          },
          clientId: 'test-client',
          port: 0,
          timeout: 5000,
          onAuthUrl: (url) => {
            capturedAuthUrl = url;
            // Simulate browser callback
            const parsed = new URL(url);
            const state = parsed.searchParams.get('state')!;
            const redirectUri = parsed.searchParams.get('redirect_uri')!;
            const callbackUrl = `${redirectUri}?code=mock_auth_code&state=${state}`;

            // Make the callback request
            setTimeout(() => {
              http.get(callbackUrl);
            }, 50);
          },
        });

        const tokenData = await flowPromise;

        expect(capturedAuthUrl).toBeDefined();
        expect(tokenData.access_token).toBe('mock_access_token');
        expect(tokenData.refresh_token).toBe('mock_refresh_token');
        expect(tokenData.token_type).toBe('Bearer');
        expect(tokenData.expires_at).toBeGreaterThan(0);
      } finally {
        tokenServer.close();
      }
    });

    it('should reject on state mismatch', async () => {
      const flowPromise = runOAuthFlow({
        toolName: 'test',
        auth: {
          type: 'oauth2',
          auth_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
          scopes: [],
        },
        clientId: 'test-client',
        port: 0,
        timeout: 5000,
        onAuthUrl: (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get('redirect_uri')!;
          // Send wrong state
          setTimeout(() => {
            http.get(`${redirectUri}?code=test&state=wrong_state`);
          }, 50);
        },
      });

      await expect(flowPromise).rejects.toThrow('state mismatch');
    });

    it('should reject on OAuth error callback', async () => {
      const flowPromise = runOAuthFlow({
        toolName: 'test',
        auth: {
          type: 'oauth2',
          auth_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
          scopes: [],
        },
        clientId: 'test-client',
        port: 0,
        timeout: 5000,
        onAuthUrl: (url) => {
          const parsed = new URL(url);
          const redirectUri = parsed.searchParams.get('redirect_uri')!;
          setTimeout(() => {
            http.get(`${redirectUri}?error=access_denied&error_description=User+denied`);
          }, 50);
        },
      });

      await expect(flowPromise).rejects.toThrow('authorization denied');
    });

    it('should timeout if no callback received', async () => {
      const flowPromise = runOAuthFlow({
        toolName: 'test',
        auth: {
          type: 'oauth2',
          auth_url: 'https://auth.example.com/authorize',
          token_url: 'https://auth.example.com/token',
          scopes: [],
        },
        clientId: 'test-client',
        port: 0,
        timeout: 200,
        onAuthUrl: () => {
          // Don't make any callback — let it timeout
        },
      });

      await expect(flowPromise).rejects.toThrow('timed out');
    });
  });
});
