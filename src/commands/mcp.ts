import { Command } from 'commander';
import chalk from 'chalk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer, watchToolsDirectory } from '../mcp/server.js';
import { readInstalledTools } from '../services/storage.js';

export const mcpCommand = new Command('mcp')
  .description('Start the Stackrun MCP server (stdio transport)')
  .option('--list', 'List tools that would be exposed via MCP, then exit')
  .addHelpText(
    'after',
    `
Examples:
  $ stackrun mcp              # start the MCP server
  $ stackrun mcp --list       # preview exposed MCP tools`,
  )
  .action(async (options: { list?: boolean }) => {
    if (options.list) {
      await listMcpTools();
      return;
    }

    await startMcpServer();
  });

/** Lists all MCP tools that would be exposed, without starting the server */
async function listMcpTools(): Promise<void> {
  const manifests = await readInstalledTools();

  if (manifests.length === 0) {
    console.error(chalk.yellow('No tools installed. Run: stackrun install <tool>'));
    return;
  }

  const isJson = !process.stdout.isTTY;

  if (isJson) {
    const tools = manifests.flatMap((m) =>
      m.commands.map((c) => ({
        name: `${m.name}_${c.name}`,
        tool: m.name,
        command: c.name,
        description: c.description,
        method: c.method,
        path: c.path,
      })),
    );
    process.stdout.write(JSON.stringify(tools, null, 2) + '\n');
    return;
  }

  console.error(chalk.bold('MCP tools that would be exposed:\n'));

  let total = 0;
  for (const manifest of manifests) {
    console.error(
      chalk.bold.cyan(manifest.name) + chalk.gray(` (${manifest.commands.length} commands)`),
    );
    for (const cmd of manifest.commands) {
      console.error(
        `  ${chalk.white(`${manifest.name}_${cmd.name}`)} — ${chalk.gray(cmd.description)}`,
      );
      total++;
    }
    console.error('');
  }

  console.error(chalk.gray(`${total} MCP tool(s) from ${manifests.length} installed tool(s).`));
}

/** Starts the MCP server with stdio transport */
async function startMcpServer(): Promise<void> {
  const server = await createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Watch for manifest changes and dynamically add/remove MCP tools
  watchToolsDirectory(server);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error(chalk.green('Stackrun MCP server running on stdio'));
}
