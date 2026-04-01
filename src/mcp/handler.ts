import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { readToolManifest } from '../services/storage.js';
import { getToken } from '../services/auth.js';
import { executeCommand, HttpApiError } from '../services/executor.js';
import type { ToolManifest, ToolCommand } from '../types/manifest.js';

/** Parses an MCP tool name like "stripe_list_customers" into tool + command */
export function parseMcpToolName(
  mcpToolName: string,
): { toolName: string; commandName: string } | null {
  const separatorIndex = mcpToolName.indexOf('_');
  if (separatorIndex === -1) return null;

  const toolName = mcpToolName.slice(0, separatorIndex);
  const commandName = mcpToolName.slice(separatorIndex + 1);
  if (!toolName || !commandName) return null;

  return { toolName, commandName };
}

/** Finds a command in a manifest, supporting both exact match and suffix match for compound tool names */
function findCommand(
  manifest: ToolManifest,
  commandName: string,
  originalMcpName: string,
): ToolCommand | null {
  // Exact match first
  const exact = manifest.commands.find((c) => c.name === commandName);
  if (exact) return exact;

  // For tools with hyphens (e.g., "hub-spot"), the first split may be wrong.
  // Try matching by checking all commands against the full MCP name pattern.
  for (const cmd of manifest.commands) {
    if (originalMcpName === `${manifest.name}_${cmd.name}`) {
      return cmd;
    }
  }

  return null;
}

/** Handles an MCP tool call by routing to the executor service */
export async function handleToolCall(
  mcpToolName: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = parseMcpToolName(mcpToolName);
  if (!parsed) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Invalid tool name format: ${mcpToolName}` }],
    };
  }

  const manifest = await findManifestForTool(mcpToolName, parsed.toolName);
  if (!manifest) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Tool "${parsed.toolName}" is not installed. Run: stackrun install ${parsed.toolName}`,
        },
      ],
    };
  }

  const command = findCommand(manifest, parsed.commandName, mcpToolName);
  if (!command) {
    return {
      isError: true,
      content: [
        { type: 'text', text: `Command "${parsed.commandName}" not found in ${manifest.name}` },
      ],
    };
  }

  // Check auth
  if (manifest.auth.type !== 'none') {
    const token = await getToken(manifest.name);
    if (!token) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `No token stored for ${manifest.name}. Run: stackrun login ${manifest.name}`,
          },
        ],
      };
    }
    return executeAndFormat(manifest, command, args, token);
  }

  return executeAndFormat(manifest, command, args, null);
}

/** Tries to find the manifest, handling tool names with underscores/hyphens */
async function findManifestForTool(
  mcpToolName: string,
  firstGuess: string,
): Promise<ToolManifest | null> {
  // Try the simple first-segment guess
  const manifest = await readToolManifest(firstGuess);
  if (manifest) return manifest;

  // For compound tool names (e.g., "hub_spot_list_contacts" where tool is "hub-spot"),
  // we can't know where tool ends and command begins. Try progressively longer prefixes.
  const parts = mcpToolName.split('_');
  for (let i = 2; i < parts.length; i++) {
    const candidateTool = parts.slice(0, i).join('-');
    const found = await readToolManifest(candidateTool);
    if (found) return found;
  }

  return null;
}

/** Executes a command and formats the result as MCP CallToolResult */
async function executeAndFormat(
  manifest: ToolManifest,
  command: ToolCommand,
  args: Record<string, unknown>,
  token: string | null,
): Promise<CallToolResult> {
  // Convert all arg values to strings (executor expects Record<string, string>)
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    params[key] = String(value);
  }

  try {
    const result = await executeCommand({ manifest, command, params, token });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ status: result.status, data: result.data }, null, 2),
        },
      ],
    };
  } catch (err) {
    if (err instanceof HttpApiError) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { status: err.status, error: err.message, data: err.responseData },
              null,
              2,
            ),
          },
        ],
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: message }],
    };
  }
}
