import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock homedir for storage isolation
const mockHomeDir = vi.fn<() => string>();
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: () => mockHomeDir() };
});

const { saveToken, getToken, removeToken, hasToken } = await import(
  '../../src/services/auth.js'
);
const { ensureConfigDir } = await import('../../src/services/storage.js');

describe('Auth Service', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'stackrun-auth-'));
    mockHomeDir.mockReturnValue(tempDir);
    await ensureConfigDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should save and retrieve a token', async () => {
    await saveToken('stripe', 'sk_test_123');
    const token = await getToken('stripe');
    expect(token).toBe('sk_test_123');
  });

  it('should return null for non-existent token', async () => {
    const token = await getToken('nonexistent');
    expect(token).toBeNull();
  });

  it('should check if token exists', async () => {
    expect(await hasToken('stripe')).toBe(false);
    await saveToken('stripe', 'sk_test_123');
    expect(await hasToken('stripe')).toBe(true);
  });

  it('should remove a token and return true', async () => {
    await saveToken('stripe', 'sk_test_123');
    const removed = await removeToken('stripe');
    expect(removed).toBe(true);
    expect(await getToken('stripe')).toBeNull();
  });

  it('should return false when removing non-existent token', async () => {
    const removed = await removeToken('nonexistent');
    expect(removed).toBe(false);
  });

  it('should overwrite existing token', async () => {
    await saveToken('stripe', 'sk_test_old');
    await saveToken('stripe', 'sk_test_new');
    const token = await getToken('stripe');
    expect(token).toBe('sk_test_new');
  });

  it('should handle multiple tools independently', async () => {
    await saveToken('stripe', 'sk_test_123');
    await saveToken('github', 'ghp_abc');
    expect(await getToken('stripe')).toBe('sk_test_123');
    expect(await getToken('github')).toBe('ghp_abc');

    await removeToken('stripe');
    expect(await getToken('stripe')).toBeNull();
    expect(await getToken('github')).toBe('ghp_abc');
  });
});
