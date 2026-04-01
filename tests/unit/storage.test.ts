import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolManifest } from '../../src/types/manifest.js';

// Mock os.homedir() to use a temp directory
const mockHomeDir = vi.fn<() => string>();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockHomeDir() };
});

// Import after mocks are set up
const {
  ensureConfigDir,
  readConfig,
  writeConfig,
  readInstalledTools,
  readToolManifest,
  saveToolManifest,
  readTokens,
  writeTokens,
} = await import('../../src/services/storage.js');

const sampleManifest: ToolManifest = {
  name: 'test-tool',
  version: '1.0.0',
  description: 'A test tool',
  base_url: 'https://api.test.com/v1',
  auth: { type: 'bearer', header: 'Authorization', prefix: 'Bearer' },
  commands: [
    { name: 'list_items', method: 'GET', path: '/items', description: 'List items' },
  ],
};

describe('Storage Service', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-test-'));
    mockHomeDir.mockReturnValue(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('ensureConfigDir', () => {
    it('should create .stackrun/ and tools/ directories', async () => {
      await ensureConfigDir();
      const entries = await readdir(join(tempDir, '.stackrun'));
      expect(entries).toContain('tools');
    });

    it('should not fail if directories already exist', async () => {
      await ensureConfigDir();
      await ensureConfigDir();
      const entries = await readdir(join(tempDir, '.stackrun'));
      expect(entries).toContain('tools');
    });
  });

  describe('readConfig / writeConfig', () => {
    it('should return empty config when file does not exist', async () => {
      const config = await readConfig();
      expect(config).toEqual({});
    });

    it('should write and read config', async () => {
      const config = { registryUrl: 'https://custom.registry.com' };
      await writeConfig(config);
      const result = await readConfig();
      expect(result).toEqual(config);
    });
  });

  describe('saveToolManifest / readToolManifest / readInstalledTools', () => {
    it('should save and read a tool manifest', async () => {
      await saveToolManifest(sampleManifest);
      const result = await readToolManifest('test-tool');
      expect(result).toEqual(sampleManifest);
    });

    it('should return null for a non-existent tool', async () => {
      await ensureConfigDir();
      const result = await readToolManifest('nonexistent');
      expect(result).toBeNull();
    });

    it('should list all installed tools', async () => {
      await saveToolManifest(sampleManifest);
      const second: ToolManifest = { ...sampleManifest, name: 'other-tool' };
      await saveToolManifest(second);

      const tools = await readInstalledTools();
      expect(tools).toHaveLength(2);
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(['other-tool', 'test-tool']);
    });

    it('should return empty array when tools directory does not exist', async () => {
      const tools = await readInstalledTools();
      expect(tools).toEqual([]);
    });
  });

  describe('readTokens / writeTokens', () => {
    it('should return empty object when tokens file does not exist', async () => {
      const tokens = await readTokens();
      expect(tokens).toEqual({});
    });

    it('should write and read tokens', async () => {
      const tokens = { stripe: 'sk_test_123', github: 'ghp_abc' };
      await writeTokens(tokens);
      const result = await readTokens();
      expect(result).toEqual(tokens);
    });

    it('should set restrictive permissions on tokens file', async () => {
      await writeTokens({ stripe: 'sk_test_123' });
      const { stat } = await import('node:fs/promises');
      const stats = await stat(join(tempDir, '.stackrun', 'tokens.json'));
      // Check that the file is not world-readable (mode & 0o077 === 0)
      const otherPerms = stats.mode & 0o077;
      expect(otherPerms).toBe(0);
    });
  });
});
