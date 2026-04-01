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
const { loginCommand } = await import('../../src/commands/login.js');
const { logoutCommand } = await import('../../src/commands/logout.js');
const { getToken } = await import('../../src/services/auth.js');

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

const noAuthManifest: ToolManifest = {
  ...sampleManifest,
  name: 'public-api',
  auth: { type: 'none' },
};

describe('CLI Integration — login + logout flow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-login-'));
    mockHomeDir.mockReturnValue(tempDir);
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('should login with --token and then logout', async () => {
    // Install first
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });

    // Login
    await loginCommand.parseAsync(['stripe', '--token', 'sk_test_123'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();

    const token = await getToken('stripe');
    expect(token).toBe('sk_test_123');

    // Logout
    await logoutCommand.parseAsync(['stripe'], { from: 'user' });
    expect(process.exitCode).toBeUndefined();

    const tokenAfter = await getToken('stripe');
    expect(tokenAfter).toBeNull();
  });

  it('should fail login if tool is not installed', async () => {
    await loginCommand.parseAsync(['nonexistent', '--token', 'abc'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('should skip login for auth type "none"', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: noAuthManifest });
    await installCommand.parseAsync(['public-api'], { from: 'user' });

    process.exitCode = undefined;
    await loginCommand.parseAsync(['public-api', '--token', 'abc'], { from: 'user' });

    // Should not error, just skip
    expect(process.exitCode).toBeUndefined();
    const token = await getToken('public-api');
    expect(token).toBeNull();
  });

  it('should fail login without --token in non-TTY', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });

    process.exitCode = undefined;
    // In test env, stdin.isTTY is undefined (falsy) — simulates non-interactive
    await loginCommand.parseAsync(['stripe'], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });

  it('should warn but succeed when overwriting existing token', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
    await installCommand.parseAsync(['stripe'], { from: 'user' });

    await loginCommand.parseAsync(['stripe', '--token', 'sk_old'], { from: 'user' });
    await loginCommand.parseAsync(['stripe', '--token', 'sk_new'], { from: 'user' });

    const token = await getToken('stripe');
    expect(token).toBe('sk_new');
  });

  it('should handle logout for non-existent token gracefully', async () => {
    await logoutCommand.parseAsync(['nonexistent'], { from: 'user' });
    // Should not error, just warn
    expect(process.exitCode).toBeUndefined();
  });
});
