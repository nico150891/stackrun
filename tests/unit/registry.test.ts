import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import type { RegistryIndex, ToolManifest } from '../../src/types/manifest.js';

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, get: vi.fn() } };
});
// Mock storage so getRegistryUrl doesn't read the real filesystem
vi.mock('../../src/services/storage.js', () => ({
  readConfig: vi.fn().mockResolvedValue({}),
}));

const { fetchIndex, fetchManifest, getRegistryUrl } = await import(
  '../../src/services/registry.js'
);

const mockedAxios = vi.mocked(axios);

const sampleIndex: RegistryIndex = {
  tools: [
    { name: 'stripe', description: 'Stripe payments API', version: '1.0.0' },
    { name: 'github', description: 'GitHub REST API', version: '1.0.0' },
  ],
};

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

describe('Registry Service', () => {
  const originalEnv = process.env['STACKRUN_REGISTRY_URL'];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['STACKRUN_REGISTRY_URL'];
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['STACKRUN_REGISTRY_URL'] = originalEnv;
    } else {
      delete process.env['STACKRUN_REGISTRY_URL'];
    }
  });

  describe('getRegistryUrl', () => {
    it('should use env var when set', async () => {
      process.env['STACKRUN_REGISTRY_URL'] = 'https://env.example.com';
      const url = await getRegistryUrl();
      expect(url).toBe('https://env.example.com');
    });

    it('should fall back to default URL', async () => {
      const url = await getRegistryUrl();
      expect(url).toContain('raw.githubusercontent.com');
    });
  });

  describe('fetchIndex', () => {
    it('should fetch and return the registry index', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: sampleIndex });
      const result = await fetchIndex();
      expect(result).toEqual(sampleIndex);
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/index.json'));
    });

    it('should throw a user-friendly error on network failure', async () => {
      const axiosError = new AxiosError('fail', 'ENOTFOUND');
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      await expect(fetchIndex()).rejects.toThrow('Could not reach registry');
    });
  });

  describe('fetchManifest', () => {
    it('should fetch and return a tool manifest', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: sampleManifest });
      const result = await fetchManifest('stripe');
      expect(result).toEqual(sampleManifest);
      expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/stripe.json'));
    });

    it('should throw descriptive error for 404', async () => {
      const axiosError = new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404, data: '', headers: {}, statusText: 'Not Found', config: {} } as never);
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      await expect(fetchManifest('nonexistent')).rejects.toThrow(
        'Tool "nonexistent" not found in the registry',
      );
    });

    it('should throw a user-friendly error on timeout', async () => {
      const axiosError = new AxiosError('timeout', 'ETIMEDOUT');
      mockedAxios.get.mockRejectedValueOnce(axiosError);
      await expect(fetchManifest('stripe')).rejects.toThrow('timed out');
    });
  });
});
