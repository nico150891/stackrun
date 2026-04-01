import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import axios from 'axios';
import type { ToolManifest } from '../../src/types/manifest.js';

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

const {
  ensureConfigDir,
  readToolManifest,
  saveToolManifest,
  readTokens,
} = await import('../../src/services/storage.js');
const { saveToken, saveOAuthToken, getToken } = await import('../../src/services/auth.js');
const { executeCommand } = await import('../../src/services/executor.js');

describe('Edge Cases', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-edge-'));
    mockHomeDir.mockReturnValue(tempDir);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Restore write permissions before cleanup
    try {
      await chmod(join(tempDir, '.stackrun'), 0o755);
    } catch {
      // May not exist
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  // ──────────────────────────────────────────
  // Filesystem edge cases
  // ──────────────────────────────────────────

  describe('Filesystem', () => {
    it('should handle ~/.stackrun/ not existing yet', async () => {
      // ensureConfigDir should create it
      await ensureConfigDir();
      const manifest = await readToolManifest('nonexistent');
      expect(manifest).toBeNull();
    });

    it('should fail gracefully when config dir is read-only', async () => {
      await ensureConfigDir();
      await chmod(join(tempDir, '.stackrun'), 0o444);

      await expect(saveToken('stripe', 'sk_test')).rejects.toThrow();
    });

    it('should handle missing tools directory gracefully', async () => {
      // Don't call ensureConfigDir — tools dir doesn't exist
      // readToolManifest should return null, not crash
      const manifest = await readToolManifest('stripe');
      expect(manifest).toBeNull();
    });

    it('should handle tokens.json not existing', async () => {
      await ensureConfigDir();
      // readTokens should return empty object, not crash
      const tokens = await readTokens();
      expect(tokens).toEqual({});
    });
  });

  // ──────────────────────────────────────────
  // Large response handling
  // ──────────────────────────────────────────

  describe('Large responses', () => {
    it('should handle a large API response without crashing', async () => {
      // Simulate a 10MB response
      const largeArray = Array.from({ length: 50_000 }, (_, i) => ({
        id: i,
        name: `item_${i}`,
        description: 'x'.repeat(100),
      }));

      mockedAxios.request.mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: largeArray,
      });

      const manifest: ToolManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.example.com',
        auth: { type: 'none' },
        commands: [{ name: 'list', method: 'GET', path: '/items', description: 'List' }],
      };

      const result = await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: {},
        token: null,
      });

      expect(result.status).toBe(200);
      expect((result.data as unknown[]).length).toBe(50_000);
    });
  });

  // ──────────────────────────────────────────
  // Concurrent token operations
  // ──────────────────────────────────────────

  describe('Concurrent operations', () => {
    it('should handle concurrent token saves without corruption', async () => {
      await ensureConfigDir();

      // Simulate 10 concurrent token saves for different tools
      const saves = Array.from({ length: 10 }, (_, i) =>
        saveToken(`tool-${i}`, `token-${i}`),
      );

      await Promise.all(saves);

      // Verify all tokens were saved
      const tokens = await readTokens();
      for (let i = 0; i < 10; i++) {
        expect(tokens[`tool-${i}`]).toBe(`token-${i}`);
      }
    });

    it('should handle concurrent manifest reads', async () => {
      await ensureConfigDir();

      const manifest: ToolManifest = {
        name: 'test',
        version: '1.0.0',
        description: 'Test',
        base_url: 'https://api.example.com',
        auth: { type: 'none' },
        commands: [{ name: 'test', method: 'GET', path: '/t', description: 'T' }],
      };
      await saveToolManifest(manifest);

      // Read the same manifest 20 times concurrently
      const reads = Array.from({ length: 20 }, () => readToolManifest('test'));
      const results = await Promise.all(reads);

      for (const result of results) {
        expect(result?.name).toBe('test');
      }
    });

    it('should handle concurrent OAuth token save and read', async () => {
      await ensureConfigDir();

      // Save OAuth token
      await saveOAuthToken('google', {
        access_token: 'initial',
        refresh_token: 'refresh_123',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });

      // Concurrent: save a new token while reading the old one
      const [_, token] = await Promise.all([
        saveOAuthToken('google', {
          access_token: 'updated',
          refresh_token: 'refresh_456',
          expires_at: Math.floor(Date.now() / 1000) + 7200,
        }),
        getToken('google'),
      ]);

      // Token should be either 'initial' or 'updated' — never corrupted
      expect(['initial', 'updated']).toContain(token);
    });
  });

  // ──────────────────────────────────────────
  // Manifest edge cases
  // ──────────────────────────────────────────

  describe('Manifest edge cases', () => {
    it('should handle manifest with many commands', async () => {
      await ensureConfigDir();

      const commands = Array.from({ length: 200 }, (_, i) => ({
        name: `command_${i}`,
        method: 'GET' as const,
        path: `/endpoint_${i}`,
        description: `Command ${i}`,
      }));

      const manifest: ToolManifest = {
        name: 'mega-api',
        version: '1.0.0',
        description: 'API with many commands',
        base_url: 'https://api.example.com',
        auth: { type: 'none' as const },
        commands,
      };

      await saveToolManifest(manifest);
      const loaded = await readToolManifest('mega-api');
      expect(loaded?.commands.length).toBe(200);
    });

    it('should handle empty string params', async () => {
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
        commands: [{
          name: 'search',
          method: 'GET',
          path: '/search',
          description: 'Search',
          params: [
            { name: 'q', description: 'Query', required: true, location: 'query', type: 'string' },
          ],
        }],
      };

      await executeCommand({
        manifest,
        command: manifest.commands[0],
        params: { q: '' },
        token: null,
      });

      const callArgs = mockedAxios.request.mock.calls[0][0];
      expect(callArgs.params.q).toBe('');
    });
  });
});
