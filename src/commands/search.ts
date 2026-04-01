import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { fetchIndex } from '../services/registry.js';
import type { RegistryEntry } from '../types/manifest.js';

export const searchCommand = new Command('search')
  .description('Search available tools in the registry')
  .argument('[query]', 'Filter tools by name or description')
  .option('--json', 'Output results as JSON to stdout')
  .option('--agent', 'Machine-readable output (no spinners, no color)')
  .addHelpText('after', `
Examples:
  $ stackrun search stripe      # search by name
  $ stackrun search payments    # search by description
  $ stackrun search             # list all tools
  $ stackrun search --json      # JSON output for scripting`)
  .action(async (query: string | undefined, options: { json?: boolean; agent?: boolean }) => {
    const isJson = options.json || options.agent || !process.stdout.isTTY;
    const spinner = isJson ? null : ora('Fetching registry...').start();

    try {
      const index = await fetchIndex();
      let results: RegistryEntry[] = index.tools;

      if (query) {
        const lowerQuery = query.toLowerCase();
        results = results.filter(
          (tool) =>
            tool.name.toLowerCase().includes(lowerQuery) ||
            tool.description.toLowerCase().includes(lowerQuery),
        );
      }

      spinner?.stop();

      if (isJson) {
        process.stdout.write(JSON.stringify(results, null, 2) + '\n');
        return;
      }

      if (results.length === 0) {
        console.error(chalk.yellow(query ? `No tools found matching "${query}".` : 'Registry is empty.'));
        return;
      }

      // Table header
      const nameWidth = 20;
      const versionWidth = 10;
      console.error(
        chalk.bold(
          `${'Name'.padEnd(nameWidth)}${'Version'.padEnd(versionWidth)}Description`,
        ),
      );
      console.error(chalk.gray('─'.repeat(60)));

      for (const tool of results) {
        console.error(
          `${chalk.cyan(tool.name.padEnd(nameWidth))}${chalk.gray(tool.version.padEnd(versionWidth))}${tool.description}`,
        );
      }

      console.error(chalk.gray(`\n${results.length} tool(s) found.`));
    } catch (err) {
      spinner?.fail('Failed to fetch registry');
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error: ${message}`));
      process.exitCode = 2;
    }
  });
