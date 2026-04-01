import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMcpToolName, handleToolCall } from '../../src/mcp/handler.js';
import type { ToolManifest } from '../../src/types/manifest.js';

// Mock dependencies
vi.mock('../../src/services/storage.js', () => ({
  readToolManifest: vi.fn(),
}));

vi.mock('../../src/services/auth.js', () => ({
  getToken: vi.fn(),
}));

vi.mock('../../src/services/executor.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/executor.js')>(
    '../../src/services/executor.js',
  );
  return {
    ...actual,
    executeCommand: vi.fn(),
  };
});

import { readToolManifest } from '../../src/services/storage.js';
import { getToken } from '../../src/services/auth.js';
import { executeCommand, HttpApiError } from '../../src/services/executor.js';

const mockedReadToolManifest = vi.mocked(readToolManifest);
const mockedGetToken = vi.mocked(getToken);
const mockedExecuteCommand = vi.mocked(executeCommand);

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
        { name: 'email', description: 'Email address', required: true, location: 'body', type: 'string' },
      ],
    },
  ],
};

describe('parseMcpToolName', () => {
  it('should parse tool_command format', () => {
    expect(parseMcpToolName('stripe_list_customers')).toEqual({
      toolName: 'stripe',
      commandName: 'list_customers',
    });
  });

  it('should return null for names without underscore', () => {
    expect(parseMcpToolName('stripe')).toBeNull();
  });

  it('should return null for empty segments', () => {
    expect(parseMcpToolName('_something')).toBeNull();
    expect(parseMcpToolName('something_')).toBeNull();
  });

  it('should handle single-word command names', () => {
    expect(parseMcpToolName('github_repos')).toEqual({
      toolName: 'github',
      commandName: 'repos',
    });
  });
});

describe('handleToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should execute a tool call and return structured result', async () => {
    mockedReadToolManifest.mockResolvedValueOnce(stripeManifest);
    mockedGetToken.mockResolvedValueOnce('sk_test_123');
    mockedExecuteCommand.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { data: [{ id: 'cus_1' }] },
    });

    const result = await handleToolCall('stripe_list_customers', { limit: 5 });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.status).toBe(200);
    expect(parsed.data.data[0].id).toBe('cus_1');

    expect(mockedExecuteCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: stripeManifest,
        command: stripeManifest.commands[0],
        params: { limit: '5' },
        token: 'sk_test_123',
      }),
    );
  });

  it('should return error when tool is not installed', async () => {
    mockedReadToolManifest.mockResolvedValueOnce(null);

    const result = await handleToolCall('unknown_do_thing', {});

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('not installed');
  });

  it('should return error when command not found', async () => {
    mockedReadToolManifest.mockResolvedValueOnce(stripeManifest);

    const result = await handleToolCall('stripe_nonexistent', {});

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('not found');
  });

  it('should return error when no token stored for authenticated tool', async () => {
    mockedReadToolManifest.mockResolvedValueOnce(stripeManifest);
    mockedGetToken.mockResolvedValueOnce(null);

    const result = await handleToolCall('stripe_list_customers', {});

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('stackrun login stripe');
  });

  it('should handle HTTP API errors', async () => {
    mockedReadToolManifest.mockResolvedValueOnce(stripeManifest);
    mockedGetToken.mockResolvedValueOnce('sk_test_123');
    mockedExecuteCommand.mockRejectedValueOnce(
      new HttpApiError(401, 'Authentication failed', { error: { message: 'Invalid API key' } }),
    );

    const result = await handleToolCall('stripe_list_customers', {});

    expect(result.isError).toBe(true);
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.status).toBe(401);
    expect(parsed.error).toContain('Authentication failed');
  });

  it('should handle network errors', async () => {
    mockedReadToolManifest.mockResolvedValueOnce(stripeManifest);
    mockedGetToken.mockResolvedValueOnce('sk_test_123');
    mockedExecuteCommand.mockRejectedValueOnce(new Error('Could not reach stripe API'));

    const result = await handleToolCall('stripe_list_customers', {});

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Could not reach');
  });

  it('should convert arg values to strings for the executor', async () => {
    mockedReadToolManifest.mockResolvedValueOnce(stripeManifest);
    mockedGetToken.mockResolvedValueOnce('sk_test_123');
    mockedExecuteCommand.mockResolvedValueOnce({ status: 201, headers: {}, data: { id: 'cus_2' } });

    await handleToolCall('stripe_create_customer', { email: 'test@example.com' });

    expect(mockedExecuteCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { email: 'test@example.com' },
      }),
    );
  });

  it('should skip auth check for tools with auth type none', async () => {
    const noAuthManifest: ToolManifest = {
      ...stripeManifest,
      name: 'public',
      auth: { type: 'none' },
      commands: [{ name: 'health', method: 'GET', path: '/health', description: 'Health check' }],
    };
    mockedReadToolManifest.mockResolvedValueOnce(noAuthManifest);
    mockedExecuteCommand.mockResolvedValueOnce({ status: 200, headers: {}, data: { ok: true } });

    const result = await handleToolCall('public_health', {});

    expect(result.isError).toBeUndefined();
    expect(mockedGetToken).not.toHaveBeenCalled();
  });

  it('should return error for invalid tool name format', async () => {
    const result = await handleToolCall('invalidname', {});

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Invalid tool name format');
  });
});
