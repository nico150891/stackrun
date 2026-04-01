import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RegistryIndex } from '../../src/types/manifest.js';

// Mock axios to avoid real HTTP calls
vi.mock('axios');
// Mock storage so registry doesn't read real filesystem
vi.mock('../../src/services/storage.js', () => ({
  readConfig: vi.fn().mockResolvedValue({}),
}));

const axios = (await import('axios')).default;
const mockedAxios = vi.mocked(axios);

const sampleIndex: RegistryIndex = {
  tools: [
    { name: 'stripe', description: 'Stripe payments API', version: '1.0.0' },
    { name: 'github', description: 'GitHub REST API', version: '1.0.0' },
    { name: 'notion', description: 'Notion workspace API', version: '1.0.0' },
  ],
};

describe('CLI Integration — search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['STACKRUN_REGISTRY_URL'];
  });

  it('should return matching tools as JSON', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: sampleIndex });

    // Import the search command and invoke it programmatically
    const { searchCommand } = await import('../../src/commands/search.js');

    // Capture stdout
    const stdoutChunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      await searchCommand.parseAsync(['stripe', '--json'], { from: 'user' });
    } finally {
      process.stdout.write = originalWrite;
    }

    const output = stdoutChunks.join('');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('stripe');
  });

  it('should return all tools when no query is provided', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: sampleIndex });

    const { searchCommand } = await import('../../src/commands/search.js');

    const stdoutChunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      await searchCommand.parseAsync(['--json'], { from: 'user' });
    } finally {
      process.stdout.write = originalWrite;
    }

    const output = stdoutChunks.join('');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(3);
  });

  it('should return empty array for non-matching query', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: sampleIndex });

    const { searchCommand } = await import('../../src/commands/search.js');

    const stdoutChunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      await searchCommand.parseAsync(['nonexistent', '--json'], { from: 'user' });
    } finally {
      process.stdout.write = originalWrite;
    }

    const output = stdoutChunks.join('');
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(0);
  });
});
