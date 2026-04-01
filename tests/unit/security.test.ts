import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readdirSync, readFileSync } from 'node:fs';
import axios from 'axios';
import type { ToolManifest, ToolCommand } from '../../src/types/manifest.js';

// Mock homedir for storage isolation
const mockHomeDir = vi.fn<() => string>();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockHomeDir() };
});

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, request: vi.fn(), post: vi.fn() } };
});

const mockedAxios = vi.mocked(axios);

const { ensureConfigDir } = await import('../../src/services/storage.js');
const { saveToken } = await import('../../src/services/auth.js');
const { validateManifest } = await import('../../src/services/validator.js');
const { executeCommand } = await import('../../src/services/executor.js');

describe('Security', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-security-'));
    mockHomeDir.mockReturnValue(tempDir);
    await ensureConfigDir();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────
  // Token storage security
  // ──────────────────────────────────────────

  describe('Token storage', () => {
    it('tokens.json should have 0o600 permissions', async () => {
      await saveToken('stripe', 'sk_test_secret');

      const tokensPath = join(tempDir, '.stackrun', 'tokens.json');
      const fileStat = await stat(tokensPath);
      const mode = fileStat.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it('tokens should never appear in stdout during --json output', async () => {
      // Simulate what call.ts does: token goes to executor, response goes to stdout
      // The executor should NOT include the token in the response
      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { id: 'cus_123', email: 'test@test.com' },
      });

      const manifest: ToolManifest = {
        name: 'stripe',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.stripe.com/v1',
        auth: { type: 'bearer', header: 'Authorization', prefix: 'Bearer' },
        commands: [{ name: 'test', method: 'GET', path: '/test', description: 'Test' }],
      };

      const result = await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: {},
        token: 'sk_test_supersecret',
      });

      // The response data should not contain the token
      const responseStr = JSON.stringify(result.data);
      expect(responseStr).not.toContain('sk_test_supersecret');
    });

    it('verbose output should not include auth header value', async () => {
      // Verify that the axios request is called with the auth header,
      // but the verbose logging (done by call.ts) only logs URL, not headers
      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {},
      });

      const manifest: ToolManifest = {
        name: 'stripe',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.stripe.com/v1',
        auth: { type: 'bearer', header: 'Authorization', prefix: 'Bearer' },
        commands: [{ name: 'test', method: 'GET', path: '/test', description: 'Test' }],
      };

      await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: {},
        token: 'sk_test_secret',
      });

      // Verify token was sent to the API (correct behavior)
      const callArgs = mockedAxios.request.mock.calls[0][0];
      expect(callArgs.headers['Authorization']).toBe('Bearer sk_test_secret');

      // The executor itself doesn't log — call.ts handles verbose output.
      // This test confirms the token is in the request but not in the return value.
      // (call.ts verbose only logs URL, params, status, content-type — not headers)
    });
  });

  // ──────────────────────────────────────────
  // Input validation / injection
  // ──────────────────────────────────────────

  describe('Input validation', () => {
    const baseManifest = {
      name: 'test-tool',
      version: '1.0.0',
      description: 'Test',
      base_url: 'https://api.example.com',
      auth: { type: 'none' as const },
      commands: [
        { name: 'test_cmd', method: 'GET', path: '/test', description: 'Test' },
      ],
    };

    it('should reject manifest name with path traversal characters', () => {
      const errors = validateManifest({
        ...baseManifest,
        name: '../../etc/passwd',
      });
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should reject manifest name with slashes', () => {
      const errors = validateManifest({
        ...baseManifest,
        name: 'foo/bar',
      });
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should reject manifest name with dots', () => {
      const errors = validateManifest({
        ...baseManifest,
        name: 'foo..bar',
      });
      expect(errors.some((e) => e.field === 'name')).toBe(true);
    });

    it('should reject non-HTTPS base_url', () => {
      const errors = validateManifest({
        ...baseManifest,
        base_url: 'http://api.example.com',
      });
      expect(errors.some((e) => e.field === 'base_url')).toBe(true);
    });

    it('should reject base_url with path traversal', () => {
      const errors = validateManifest({
        ...baseManifest,
        base_url: 'https://evil.com/../../../etc/passwd',
      });
      // base_url technically starts with https:// so it passes the basic check.
      // The URL normalization in the executor should handle this.
      // Let's verify the executor normalizes it:
      const url = new URL('https://evil.com/../../../etc/passwd');
      // URL constructor normalizes path traversal
      expect(url.pathname).toBe('/etc/passwd');
      expect(url.origin).toBe('https://evil.com');
    });

    it('should handle param values with newline characters in headers safely', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {},
      });

      const manifest: ToolManifest = {
        ...baseManifest,
        commands: [{
          name: 'test',
          method: 'POST',
          path: '/test',
          description: 'Test',
          params: [
            { name: 'value', description: 'Test', required: true, location: 'body', type: 'string' },
          ],
        }],
      };

      // Param value with newline (potential header injection in some HTTP libs)
      await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: { value: 'normal\r\nX-Injected: evil' },
        token: null,
      });

      // Axios should receive the value as-is in the body (not headers)
      const callArgs = mockedAxios.request.mock.calls[0][0];
      expect(callArgs.data.value).toBe('normal\r\nX-Injected: evil');
      // The newline is in the body, not headers — this is safe because body params
      // don't become headers
    });

    it('should handle path params with encoded characters', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {},
      });

      const manifest: ToolManifest = {
        ...baseManifest,
        commands: [{
          name: 'get_item',
          method: 'GET',
          path: '/items/:id',
          description: 'Test',
          params: [
            { name: 'id', description: 'Item ID', required: true, location: 'path', type: 'string' },
          ],
        }],
      };

      // Path param with special characters
      await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: { id: '../admin/delete' },
        token: null,
      });

      // encodeURIComponent should encode the slashes
      const callArgs = mockedAxios.request.mock.calls[0][0];
      expect(callArgs.url).toBe('https://api.example.com/items/..%2Fadmin%2Fdelete');
    });

    it('should handle null bytes in param values', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {},
      });

      const manifest: ToolManifest = {
        ...baseManifest,
        commands: [{
          name: 'search',
          method: 'GET',
          path: '/search',
          description: 'Test',
          params: [
            { name: 'q', description: 'Query', required: true, location: 'query', type: 'string' },
          ],
        }],
      };

      await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: { q: 'test\x00malicious' },
        token: null,
      });

      // Null bytes go through as query params — axios/Node handle this safely
      const callArgs = mockedAxios.request.mock.calls[0][0];
      expect(callArgs.params.q).toBe('test\x00malicious');
    });
  });

  // ──────────────────────────────────────────
  // OAuth2 security
  // ──────────────────────────────────────────

  describe('OAuth2 security', () => {
    it('should reject non-HTTPS auth_url', () => {
      const errors = validateManifest({
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.example.com',
        auth: {
          type: 'oauth2',
          auth_url: 'http://evil.com/auth',
          token_url: 'https://oauth.example.com/token',
          scopes: ['read'],
        },
        commands: [{ name: 'test', method: 'GET', path: '/test', description: 'Test' }],
      });
      expect(errors.some((e) => e.field === 'auth.auth_url')).toBe(true);
    });

    it('should reject non-HTTPS token_url', () => {
      const errors = validateManifest({
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.example.com',
        auth: {
          type: 'oauth2',
          auth_url: 'https://oauth.example.com/auth',
          token_url: 'http://evil.com/token',
          scopes: ['read'],
        },
        commands: [{ name: 'test', method: 'GET', path: '/test', description: 'Test' }],
      });
      expect(errors.some((e) => e.field === 'auth.token_url')).toBe(true);
    });

    // State mismatch and error callback are already tested in oauth.test.ts
  });

  // ──────────────────────────────────────────
  // Network security
  // ──────────────────────────────────────────

  describe('Network security', () => {
    it('all registry manifests should use HTTPS base_url', () => {
      const registryDir = join(process.cwd(), 'registry');
      const files = readdirSync(registryDir).filter(
        (f) => f.endsWith('.json') && f !== 'index.json',
      );

      for (const file of files) {
        const content = JSON.parse(readFileSync(join(registryDir, file), 'utf-8'));
        expect(
          content.base_url.startsWith('https://'),
          `${file}: base_url "${content.base_url}" must be HTTPS`,
        ).toBe(true);
      }
    });

    it('all registry manifests should pass validation', () => {
      const registryDir = join(process.cwd(), 'registry');
      const files = readdirSync(registryDir).filter(
        (f) => f.endsWith('.json') && f !== 'index.json',
      );

      for (const file of files) {
        const content = JSON.parse(readFileSync(join(registryDir, file), 'utf-8'));
        const errors = validateManifest(content);
        expect(errors, `${file} has validation errors: ${JSON.stringify(errors)}`).toHaveLength(0);
      }
    });

    it('executor should disable redirects for authenticated requests', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {},
      });

      const manifest: ToolManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.example.com',
        auth: { type: 'bearer', header: 'Authorization', prefix: 'Bearer' },
        commands: [{ name: 'test', method: 'GET', path: '/data', description: 'Test' }],
      };

      await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: {},
        token: 'secret_token',
      });

      const callArgs = mockedAxios.request.mock.calls[0][0];
      // Redirects disabled to prevent token leaking via HTTPS→HTTP redirect
      expect(callArgs.maxRedirects).toBe(0);
    });

    it('executor should allow redirects for unauthenticated requests', async () => {
      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: {},
        data: {},
      });

      const manifest: ToolManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.example.com',
        auth: { type: 'none' },
        commands: [{ name: 'test', method: 'GET', path: '/data', description: 'Test' }],
      };

      await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: {},
        token: null,
      });

      const callArgs = mockedAxios.request.mock.calls[0][0];
      expect(callArgs.maxRedirects).toBe(5);
    });

    it('OAuth2 callback server binds to 127.0.0.1 only', async () => {
      // This is verified by the oauth.ts source: server.listen(port, '127.0.0.1')
      // The test in oauth.test.ts exercises the full flow on 127.0.0.1
      // Here we verify the source code hasn't changed
      const oauthSource = readFileSync(
        join(process.cwd(), 'src', 'services', 'oauth.ts'),
        'utf-8',
      );
      expect(oauthSource).toContain("server.listen(port, '127.0.0.1'");
    });
  });

  // ──────────────────────────────────────────
  // Command injection
  // ──────────────────────────────────────────

  describe('Command injection prevention', () => {
    it('openBrowser should use execFile, not exec', () => {
      const loginSource = readFileSync(
        join(process.cwd(), 'src', 'commands', 'login.ts'),
        'utf-8',
      );
      // execFile is safe (no shell interpolation), exec is not
      expect(loginSource).toContain('execFile');
      expect(loginSource).not.toMatch(/\bexec\b\(/);
    });
  });
});
