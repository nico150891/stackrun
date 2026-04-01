import { Command } from 'commander';
import chalk from 'chalk';
import { readInstalledTools, readTokens } from '../services/storage.js';

export const listCommand = new Command('list')
  .description('List locally installed tools')
  .option('--json', 'Output results as JSON to stdout')
  .option('--agent', 'Machine-readable output (no spinners, no color)')
  .addHelpText(
    'after',
    `
Examples:
  $ stackrun list          # show installed tools
  $ stackrun list --json   # JSON output for scripting`,
  )
  .action(async (options: { json?: boolean; agent?: boolean }) => {
    try {
      const tools = await readInstalledTools();

      if (options.json || options.agent || !process.stdout.isTTY) {
        process.stdout.write(JSON.stringify(tools, null, 2) + '\n');
        return;
      }

      if (tools.length === 0) {
        console.error(chalk.yellow('No tools installed.'));
        console.error(chalk.gray('Run: stackrun search <query> to find tools.'));
        return;
      }

      const tokens = await readTokens();

      const nameW = 20;
      const versionW = 10;
      const cmdsW = 10;
      const authW = 12;

      console.error(
        chalk.bold(
          `${'Name'.padEnd(nameW)}${'Version'.padEnd(versionW)}${'Commands'.padEnd(cmdsW)}${'Auth'.padEnd(authW)}Description`,
        ),
      );
      console.error(chalk.gray('─'.repeat(72)));

      for (const tool of tools) {
        const cmdCount = String(tool.commands.length);
        const hasToken = tokens[tool.name] ? chalk.green('✓') : chalk.gray('–');
        const authLabel = `${tool.auth.type} ${hasToken}`;

        console.error(
          `${chalk.cyan(tool.name.padEnd(nameW))}${chalk.gray(tool.version.padEnd(versionW))}${cmdCount.padEnd(cmdsW)}${authLabel.padEnd(authW)}${tool.description}`,
        );
      }

      console.error(chalk.gray(`\n${tools.length} tool(s) installed.`));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error: ${message}`));
      process.exitCode = 1;
    }
  });
