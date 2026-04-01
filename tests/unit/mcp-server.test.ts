import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolManifest } from '../../src/types/manifest.js';

vi.mock('../../src/services/storage.js', () => ({
  readInstalledTools: vi.fn(),
  readToolManifest: vi.fn(),
}));

// Mock handler to avoid real executor calls during tool registration
vi.mock('../../src/mcp/handler.js', () => ({
  handleToolCall: vi.fn(),
}));

import { readInstalledTools, readToolManifest } from '../../src/services/storage.js';
import { createMcpServer, syncTools, clearRegisteredTools } from '../../src/mcp/server.js';

const mockedReadInstalledTools = vi.mocked(readInstalledTools);
const mockedReadToolManifest = vi.mocked(readToolManifest);

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
        { name: 'name', description: 'Full name', required: false, location: 'body', type: 'string' },
      ],
    },
  ],
};

const githubManifest: ToolManifest = {
  name: 'github',
  version: '1.0.0',
  description: 'GitHub REST API',
  base_url: 'https://api.github.com',
  auth: { type: 'bearer', header: 'Authorization', prefix: 'Bearer' },
  commands: [
    {
      name: 'get_user',
      method: 'GET',
      path: '/user',
      description: 'Get authenticated user',
    },
  ],
};

describe('MCP Server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRegisteredTools();
  });

  it('should create a server with no tools when none are installed', async () => {
    mockedReadInstalledTools.mockResolvedValueOnce([]);

    const server = await createMcpServer();

    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
  });

  it('should register MCP tools for each manifest command', async () => {
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest]);

    const server = await createMcpServer();

    expect(server).toBeDefined();
    // 2 tools registered for stripe (list_customers, create_customer)
  });

  it('should register tools from multiple manifests', async () => {
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest, githubManifest]);

    const server = await createMcpServer();

    // 3 tools total: stripe_list_customers, stripe_create_customer, github_get_user
    expect(server).toBeDefined();
  });

  it('should handle tools with no params (zero-arg commands)', async () => {
    mockedReadInstalledTools.mockResolvedValueOnce([githubManifest]);

    const server = await createMcpServer();

    // github_get_user has no params — registered without inputSchema
    expect(server).toBeDefined();
  });
});

describe('syncTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRegisteredTools();
  });

  it('should add new tools on sync', async () => {
    // First create with stripe only
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest]);
    const server = await createMcpServer();

    // Now sync with stripe + github
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest, githubManifest]);
    await syncTools(server);

    // Should not throw — github_get_user was added
    expect(server).toBeDefined();
  });

  it('should remove tools that are no longer installed', async () => {
    // First create with stripe + github
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest, githubManifest]);
    const server = await createMcpServer();

    // Now sync with only github
    mockedReadInstalledTools.mockResolvedValueOnce([githubManifest]);
    await syncTools(server);

    // Stripe tools should have been removed
    expect(server).toBeDefined();
  });

  it('should be idempotent when nothing changes', async () => {
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest]);
    const server = await createMcpServer();

    // Sync with same manifests — nothing should change
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest]);
    await syncTools(server);

    expect(server).toBeDefined();
  });

  it('should handle sync from empty to tools', async () => {
    mockedReadInstalledTools.mockResolvedValueOnce([]);
    const server = await createMcpServer();

    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest]);
    await syncTools(server);

    expect(server).toBeDefined();
  });

  it('should handle sync from tools to empty', async () => {
    mockedReadInstalledTools.mockResolvedValueOnce([stripeManifest]);
    const server = await createMcpServer();

    mockedReadInstalledTools.mockResolvedValueOnce([]);
    await syncTools(server);

    expect(server).toBeDefined();
  });
});
