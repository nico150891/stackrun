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
const { listCommand } = await import('../../src/commands/list.js');
const { uninstallCommand } = await import('../../src/commands/uninstall.js');

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

/** Capture stdout output during an async callback */
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

describe('CLI Integration — install + list + uninstall flow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-cli-'));
    mockHomeDir.mockReturnValue(tempDir);
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('should install a tool, list it, then uninstall it', async () => {
    // 1. Install
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();

    // 2. List — should show stripe in JSON output
    const listOutput = await captureStdout(async () => {
      await listCommand.parseAsync(['--json'], { from: 'user' });
    });
    const tools = JSON.parse(listOutput);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('stripe');

    // 3. Uninstall with --yes to skip prompt
    await uninstallCommand.parseAsync(['stripe', '--yes'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();

    // 4. List again — should be empty
    const listOutput2 = await captureStdout(async () => {
      await listCommand.parseAsync(['--json'], { from: 'user' });
    });
    const tools2 = JSON.parse(listOutput2);
    expect(tools2).toHaveLength(0);
  });

  it('should show empty list when no tools installed', async () => {
    const output = await captureStdout(async () => {
      await listCommand.parseAsync(['--json'], { from: 'user' });
    });
    const tools = JSON.parse(output);
    expect(tools).toEqual([]);
  });

  it('should fail to uninstall a tool that is not installed', async () => {
    await uninstallCommand.parseAsync(['nonexistent', '--yes'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });
});
