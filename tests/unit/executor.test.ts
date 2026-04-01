import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import { executeCommand, HttpApiError } from '../../src/services/executor.js';
import type { ToolManifest, ToolCommand } from '../../src/types/manifest.js';

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof import('axios')>('axios');
  return { ...actual, default: { ...actual.default, request: vi.fn() } };
});

const mockedAxios = vi.mocked(axios);

const baseManifest: ToolManifest = {
  name: 'stripe',
  version: '1.0.0',
  description: 'Stripe payments API',
  base_url: 'https://api.stripe.com/v1',
  auth: { type: 'api_key', header: 'Authorization', prefix: 'Bearer' },
  commands: [],
};

describe('Executor Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a simple GET request', async () => {
    mockedAxios.request.mockResolvedValueOnce({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: { customers: [] },
    });

    const command: ToolCommand = {
      name: 'list_customers',
      method: 'GET',
      path: '/customers',
      description: 'List customers',
    };

    const result = await executeCommand({
      manifest: baseManifest,
      command,
      params: {},
      token: 'sk_test_123',
    });

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ customers: [] });
    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://api.stripe.com/v1/customers',
      }),
    );
  });

  it('should inject auth header with prefix', async () => {
    mockedAxios.request.mockResolvedValueOnce({ status: 200, headers: {}, data: {} });

    const command: ToolCommand = {
      name: 'test',
      method: 'GET',
      path: '/test',
      description: 'Test',
    };

    await executeCommand({
      manifest: baseManifest,
      command,
      params: {},
      token: 'sk_test_123',
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test_123',
        }),
      }),
    );
  });

  it('should not inject auth header when auth type is none', async () => {
    mockedAxios.request.mockResolvedValueOnce({ status: 200, headers: {}, data: {} });

    const manifest: ToolManifest = { ...baseManifest, auth: { type: 'none' } };
    const command: ToolCommand = { name: 'test', method: 'GET', path: '/test', description: 'Test' };

    await executeCommand({ manifest, command, params: {}, token: null });

    const calledHeaders = mockedAxios.request.mock.calls[0][0].headers;
    expect(calledHeaders).not.toHaveProperty('Authorization');
  });

  it('should route query params correctly', async () => {
    mockedAxios.request.mockResolvedValueOnce({ status: 200, headers: {}, data: {} });

    const command: ToolCommand = {
      name: 'list',
      method: 'GET',
      path: '/items',
      description: 'List',
      params: [
        { name: 'limit', description: 'Max', required: false, location: 'query', type: 'number' },
      ],
    };

    await executeCommand({
      manifest: baseManifest,
      command,
      params: { limit: '10' },
      token: 'sk_test',
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { limit: '10' },
      }),
    );
  });

  it('should route body params correctly', async () => {
    mockedAxios.request.mockResolvedValueOnce({ status: 200, headers: {}, data: {} });

    const command: ToolCommand = {
      name: 'create',
      method: 'POST',
      path: '/customers',
      description: 'Create',
      params: [
        { name: 'email', description: 'Email', required: true, location: 'body', type: 'string' },
      ],
    };

    await executeCommand({
      manifest: baseManifest,
      command,
      params: { email: 'test@example.com' },
      token: 'sk_test',
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { email: 'test@example.com' },
      }),
    );
  });

  it('should replace path params', async () => {
    mockedAxios.request.mockResolvedValueOnce({ status: 200, headers: {}, data: {} });

    const command: ToolCommand = {
      name: 'get_customer',
      method: 'GET',
      path: '/customers/:id',
      description: 'Get customer',
      params: [
        { name: 'id', description: 'Customer ID', required: true, location: 'path', type: 'string' },
      ],
    };

    await executeCommand({
      manifest: baseManifest,
      command,
      params: { id: 'cus_123' },
      token: 'sk_test',
    });

    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.stripe.com/v1/customers/cus_123',
      }),
    );
  });

  it('should merge tool-level and command-level headers (command wins)', async () => {
    mockedAxios.request.mockResolvedValueOnce({ status: 200, headers: {}, data: {} });

    const manifest: ToolManifest = {
      ...baseManifest,
      headers: { 'X-Version': '2024-01-01', 'X-Custom': 'tool-level' },
    };
    const command: ToolCommand = {
      name: 'test',
      method: 'GET',
      path: '/test',
      description: 'Test',
      headers: { 'X-Custom': 'command-level' },
    };

    await executeCommand({ manifest, command, params: {}, token: 'sk_test' });

    const calledHeaders = mockedAxios.request.mock.calls[0][0].headers;
    expect(calledHeaders['X-Version']).toBe('2024-01-01');
    expect(calledHeaders['X-Custom']).toBe('command-level');
  });

  it('should throw HttpApiError on 401', async () => {
    const axiosError = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 401, data: { error: 'invalid_key' }, headers: {}, statusText: 'Unauthorized', config: {} as never,
    });
    mockedAxios.request.mockRejectedValueOnce(axiosError);

    const command: ToolCommand = { name: 'test', method: 'GET', path: '/test', description: 'Test' };

    await expect(
      executeCommand({ manifest: baseManifest, command, params: {}, token: 'bad_key' }),
    ).rejects.toThrow('Authentication failed');
  });

  it('should throw HttpApiError on 404', async () => {
    const axiosError = new AxiosError('Not Found', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 404, data: {}, headers: {}, statusText: 'Not Found', config: {} as never,
    });
    mockedAxios.request.mockRejectedValueOnce(axiosError);

    const command: ToolCommand = { name: 'test', method: 'GET', path: '/missing', description: 'Test' };

    await expect(
      executeCommand({ manifest: baseManifest, command, params: {}, token: 'sk_test' }),
    ).rejects.toThrow('Endpoint not found');
  });

  it('should throw HttpApiError on 5xx', async () => {
    const axiosError = new AxiosError('Server Error', 'ERR_BAD_RESPONSE', undefined, undefined, {
      status: 503, data: {}, headers: {}, statusText: 'Service Unavailable', config: {} as never,
    });
    mockedAxios.request.mockRejectedValueOnce(axiosError);

    const command: ToolCommand = { name: 'test', method: 'GET', path: '/test', description: 'Test' };

    const err = await executeCommand({ manifest: baseManifest, command, params: {}, token: 'sk_test' })
      .catch((e: HttpApiError) => e);
    expect(err).toBeInstanceOf(HttpApiError);
    expect(err.status).toBe(503);
    expect(err.message).toContain('API error (503)');
  });

  it('should throw on missing required param', async () => {
    const command: ToolCommand = {
      name: 'get',
      method: 'GET',
      path: '/items/:id',
      description: 'Get',
      params: [
        { name: 'id', description: 'ID', required: true, location: 'path', type: 'string' },
      ],
    };

    await expect(
      executeCommand({ manifest: baseManifest, command, params: {}, token: 'sk_test' }),
    ).rejects.toThrow('Missing required parameter: id');
  });

  it('should throw user-friendly error on network failure', async () => {
    const axiosError = new AxiosError('fail', 'ENOTFOUND');
    mockedAxios.request.mockRejectedValueOnce(axiosError);

    const command: ToolCommand = { name: 'test', method: 'GET', path: '/test', description: 'Test' };

    await expect(
      executeCommand({ manifest: baseManifest, command, params: {}, token: 'sk_test' }),
    ).rejects.toThrow('Could not reach stripe API');
  });
});
