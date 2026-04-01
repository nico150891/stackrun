import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readInstalledTools, readToolManifest } from '../services/storage.js';
import { handleToolCall } from './handler.js';
import type { CommandParam } from '../types/manifest.js';

/** Return type of registerTool — has remove(), update(), enable(), disable() */
type RegisteredTool = ReturnType<McpServer['registerTool']>;

/** Tracks registered MCP tools for dynamic add/remove */
const registeredTools = new Map<string, RegisteredTool>();

/** Active file watcher, if any */
let toolsWatcher: FSWatcher | null = null;

/** Creates and configures the MCP server with all installed tools registered */
export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer(
    { name: 'stackrun', version: '0.3.0' },
    {
      capabilities: { tools: {}, resources: {} },
      instructions:
        'Stackrun MCP server — universal bridge to SaaS APIs. ' +
        'Each tool is named <tool>_<command> (e.g., stripe_list_customers). ' +
        'Install tools with `stackrun install <tool>` and authenticate with `stackrun login <tool>`.',
    },
  );

  await syncTools(server);
  registerSchemaResource(server);

  return server;
}

/** Starts watching ~/.stackrun/tools/ for changes and syncs the MCP server */
export function watchToolsDirectory(server: McpServer): void {
  const toolsDir = join(homedir(), '.stackrun', 'tools');

  // Debounce: avoid rapid-fire resyncs when multiple files change
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    toolsWatcher = watch(toolsDir, (_eventType, filename) => {
      if (!filename?.endsWith('.json')) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        syncTools(server).catch((err) => {
          console.error(
            `[stackrun] Error syncing tools: ${err instanceof Error ? err.message : err}`,
          );
        });
      }, 300);
    });

    toolsWatcher.on('error', () => {
      // Directory might not exist yet — that's fine, no tools installed
    });
  } catch {
    // watch() can throw if directory doesn't exist — ignore
  }
}

/** Stops the file watcher */
export function stopWatching(): void {
  if (toolsWatcher) {
    toolsWatcher.close();
    toolsWatcher = null;
  }
}

/** Syncs MCP tool registrations with the current installed manifests */
export async function syncTools(server: McpServer): Promise<void> {
  const manifests = await readInstalledTools();

  // Build the desired set of MCP tool names
  const desiredTools = new Set<string>();
  for (const manifest of manifests) {
    for (const command of manifest.commands) {
      desiredTools.add(`${manifest.name}_${command.name}`);
    }
  }

  // Remove tools that are no longer installed
  for (const [mcpToolName, registered] of registeredTools) {
    if (!desiredTools.has(mcpToolName)) {
      registered.remove();
      registeredTools.delete(mcpToolName);
    }
  }

  // Add tools that are new
  for (const manifest of manifests) {
    for (const command of manifest.commands) {
      const mcpToolName = `${manifest.name}_${command.name}`;
      if (!registeredTools.has(mcpToolName)) {
        const description = `[${manifest.name}] ${command.description} (${command.method} ${command.path})`;
        const inputSchema = buildInputSchema(command.params);

        const registered = server.registerTool(
          mcpToolName,
          { description, inputSchema },
          async (args) => {
            return handleToolCall(mcpToolName, args as Record<string, unknown>);
          },
        );
        registeredTools.set(mcpToolName, registered);
      }
    }
  }
}

/** Clears all registered tools (used in tests) */
export function clearRegisteredTools(): void {
  registeredTools.clear();
}

/** Registers a resource template so agents can inspect tool schemas via stackrun://tools/{name} */
function registerSchemaResource(server: McpServer): void {
  const template = new ResourceTemplate('stackrun://tools/{tool_name}', {
    list: async () => {
      const manifests = await readInstalledTools();
      return {
        resources: manifests.map((m) => ({
          uri: `stackrun://tools/${m.name}`,
          name: m.name,
          description: m.description,
          mimeType: 'application/json',
        })),
      };
    },
  });

  server.registerResource(
    'tool-schema',
    template,
    {
      description: 'Schema of an installed Stackrun tool (manifest JSON)',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const toolName = variables.tool_name as string;
      const manifest = await readToolManifest(toolName);

      if (!manifest) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ error: `Tool "${toolName}" is not installed` }),
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(manifest, null, 2),
          },
        ],
      };
    },
  );
}

/** Converts manifest command params to a Zod shape for MCP input validation */
function buildInputSchema(
  params: CommandParam[] | undefined,
): Record<string, z.ZodTypeAny> | undefined {
  if (!params || params.length === 0) return undefined;

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const param of params) {
    let schema: z.ZodTypeAny;

    switch (param.type) {
      case 'number':
        schema = z.number().describe(param.description);
        break;
      case 'boolean':
        schema = z.boolean().describe(param.description);
        break;
      default:
        schema = z.string().describe(param.description);
        break;
    }

    if (!param.required) {
      schema = schema.optional();
    }

    shape[param.name] = schema;
  }

  return shape;
}
