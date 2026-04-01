import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolManifest } from '../../src/types/manifest.js';

// Mock homedir
const mockHomeDir = vi.fn<() => string>();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockHomeDir() };
});

// Mock axios
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, get: vi.fn() } };
});

const axios = (await import('axios')).default;
const mockedAxios = vi.mocked(axios);

const { installCommand } = await import('../../src/commands/install.js');
const { schemaCommand } = await import('../../src/commands/schema.js');

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

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join('');
}

describe('CLI Integration — schema command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-schema-'));
    mockHomeDir.mockReturnValue(tempDir);
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('should output manifest as JSON', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });

    const output = await captureStdout(async () => {
      await schemaCommand.parseAsync(['stripe', '--json'], { from: 'user' });
    });

    const parsed = JSON.parse(output);
    expect(parsed.name).toBe('stripe');
    expect(parsed.commands).toHaveLength(1);
    expect(parsed.base_url).toBe('https://api.stripe.com/v1');
  });

  it('should fail for non-installed tool', async () => {
    await schemaCommand.parseAsync(['nonexistent', '--json'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });
});
