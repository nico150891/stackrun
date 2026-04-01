import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolManifest } from '../../src/types/manifest.js';

// Mock homedir for storage isolation
const mockHomeDir = vi.fn<() => string>();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockHomeDir() };
});

// Mock axios for registry
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, get: vi.fn() } };
});

const axios = (await import('axios')).default;
const mockedAxios = vi.mocked(axios);

const { installCommand } = await import('../../src/commands/install.js');
const { readToolManifest } = await import('../../src/services/storage.js');

const sampleManifest: ToolManifest = {
  name: 'stripe',
  version: '1.0.0',
  description: 'Stripe payments API',
  base_url: 'https://api.stripe.com/v1',
  auth: { type: 'api_key', header: 'Authorization', prefix: 'Bearer' },
  commands: [
    { name: 'list_customers', method: 'GET', path: '/customers', description: 'List all customers' },
  ],
};

describe('Install Command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-install-'));
    mockHomeDir.mockReturnValue(tempDir);
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('should install a tool from registry', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });

    await installCommand.parseAsync(['stripe'], { from: 'user' });

    const saved = await readToolManifest('stripe');
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe('stripe');
    expect(process.exitCode).toBeUndefined();
  });

  it('should reject if tool is already installed', async () => {
    // First install
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });

    // Second install without --force
    process.exitCode = undefined;
    await installCommand.parseAsync(['stripe'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });

  it('should allow reinstall with --force', async () => {
    // First install
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });

    // Reinstall with --force
    process.exitCode = undefined;
    const updated = { ...sampleManifest, version: '2.0.0' };
    mockedAxios.get.mockResolvedValueOnce({ data: updated });
    await installCommand.parseAsync(['stripe', '--force'], { from: 'user' });

    const saved = await readToolManifest('stripe');
    expect(saved!.version).toBe('2.0.0');
    expect(process.exitCode).toBeUndefined();
  });

  it('should reject invalid manifest', async () => {
    const invalid = { ...sampleManifest, name: 'INVALID NAME', base_url: 'http://bad.com' };
    mockedAxios.get.mockResolvedValueOnce({ data: invalid });

    await installCommand.parseAsync(['bad-tool', '--force'], { from: 'user' });

    expect(process.exitCode).toBe(1);
  });
});
