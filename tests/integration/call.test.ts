import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import axios, { AxiosError } from 'axios';
import type { ToolManifest } from '../../src/types/manifest.js';

// Mock homedir
const mockHomeDir = vi.fn<() => string>();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockHomeDir() };
});

// Mock axios — keep real AxiosError
vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, get: vi.fn(), request: vi.fn() } };
});

const mockedAxios = vi.mocked(axios);

const { installCommand } = await import('../../src/commands/install.js');
const { loginCommand } = await import('../../src/commands/login.js');
const { callCommand } = await import('../../src/commands/call.js');

const stripeManifest: ToolManifest = {
  name: 'stripe',
  version: '1.0.0',
  description: 'Stripe payments API',
  base_url: 'https://api.stripe.com/v1',
  auth: { type: 'api_key', header: 'Authorization', prefix: 'Bearer' },
  commands: [
    {
      name: 'list_customers',
      method: 'GET',
      path: '/customers',
      description: 'List all customers',
      params: [
        { name: 'limit', description: 'Max results', required: false, location: 'query', type: 'number' },
      ],
    },
    {
      name: 'create_customer',
      method: 'POST',
      path: '/customers',
      description: 'Create a customer',
      params: [
        { name: 'email', description: 'Email', required: true, location: 'body', type: 'string' },
      ],
    },
  ],
};

/** Capture stdout during an async callback */
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

/** Helper: install stripe + login */
async function setupStripe(tempDir: string): Promise<void> {
  mockHomeDir.mockReturnValue(tempDir);
  mockedAxios.get.mockResolvedValueOnce({ data: stripeManifest });
  await installCommand.parseAsync(['stripe'], { from: 'user' });
  await loginCommand.parseAsync(['stripe', '--token', 'sk_test_123'], { from: 'user' });
}

describe('CLI Integration — call command', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-call-'));
    mockHomeDir.mockReturnValue(tempDir);
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('should call GET with query params and return JSON', async () => {
    await setupStripe(tempDir);

    mockedAxios.request.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { data: [{ id: 'cus_1' }] },
    });

    const output = await captureStdout(async () => {
      await callCommand.parseAsync(['stripe', 'list_customers', '--limit', '5', '--json'], { from: 'user' });
    });

    expect(process.exitCode).toBeUndefined();
    const parsed = JSON.parse(output);
    expect(parsed.data[0].id).toBe('cus_1');

    // Verify request was called with correct params
    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        params: expect.objectContaining({ limit: '5' }),
      }),
    );
  });

  it('should call POST with body params', async () => {
    await setupStripe(tempDir);

    mockedAxios.request.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { id: 'cus_new', email: 'test@example.com' },
    });

    const output = await captureStdout(async () => {
      await callCommand.parseAsync(
        ['stripe', 'create_customer', '--email', 'test@example.com', '--json'],
        { from: 'user' },
      );
    });

    expect(process.exitCode).toBeUndefined();
    const parsed = JSON.parse(output);
    expect(parsed.email).toBe('test@example.com');

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        data: { email: 'test@example.com' },
      }),
    );
  });

  it('should fail if tool is not installed', async () => {
    await callCommand.parseAsync(['nonexistent', 'test', '--json'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('should fail if command does not exist', async () => {
    await setupStripe(tempDir);

    await callCommand.parseAsync(['stripe', 'nonexistent_command', '--json'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('should fail if no token is stored', async () => {
    // Install without login
    mockedAxios.get.mockResolvedValueOnce({ data: stripeManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });
    process.exitCode = undefined;

    await callCommand.parseAsync(['stripe', 'list_customers', '--json'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('should handle 401 error with helpful message', async () => {
    await setupStripe(tempDir);

    const axiosError = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 401, data: { error: 'invalid_key' }, headers: {}, statusText: 'Unauthorized', config: {} as never,
    });
    mockedAxios.request.mockRejectedValueOnce(axiosError);

    const output = await captureStdout(async () => {
      await callCommand.parseAsync(['stripe', 'list_customers', '--json'], { from: 'user' });
    });

    expect(process.exitCode).toBe(1);
    // Error data should be output as JSON
    const parsed = JSON.parse(output);
    expect(parsed.error).toBe('invalid_key');
  });
});
