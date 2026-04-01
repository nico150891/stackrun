import { Command } from 'commander';
import chalk from 'chalk';
import { readToolManifest } from '../services/storage.js';
import { hasToken } from '../services/auth.js';

export const schemaCommand = new Command('schema')
  .description('Display the manifest of an installed tool')
  .argument('<tool>', 'Tool name')
  .option('--json', 'Output manifest as JSON to stdout')
  .option('--agent', 'Machine-readable output (no spinners, no color)')
  .addHelpText('after', `
Examples:
  $ stackrun schema stripe          # show available commands
  $ stackrun schema stripe --json   # output raw manifest as JSON`)
  .action(async (tool: string, options: { json?: boolean; agent?: boolean }) => {
    const manifest = await readToolManifest(tool);
    if (!manifest) {
      console.error(chalk.red(`Error: tool "${tool}" is not installed.`));
      console.error(chalk.gray(`Run: stackrun install ${tool}`));
      process.exitCode = 1;
      return;
    }

    if (options.json || options.agent || !process.stdout.isTTY) {
      process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
      return;
    }

    const tokenExists = await hasToken(tool);

    // Header
    console.error(chalk.bold.cyan(manifest.name) + chalk.gray(` v${manifest.version}`));
    console.error(chalk.gray(manifest.description));
    console.error('');

    // Base URL & Auth
    console.error(chalk.bold('Base URL:  ') + manifest.base_url);
    console.error(
      chalk.bold('Auth:      ') +
        manifest.auth.type +
        (tokenExists ? chalk.green(' (logged in)') : chalk.yellow(' (not logged in)')),
    );

    if (manifest.headers && Object.keys(manifest.headers).length > 0) {
      console.error(chalk.bold('Headers:   ') + Object.entries(manifest.headers).map(([k, v]) => `${k}: ${v}`).join(', '));
    }

    console.error('');

    // Commands table
    console.error(chalk.bold('Commands:'));
    console.error(chalk.gray('─'.repeat(60)));

    for (const cmd of manifest.commands) {
      const paramCount = cmd.params?.length ?? 0;
      const requiredParams = cmd.params?.filter((p) => p.required) ?? [];

      console.error(
        `  ${chalk.cyan(cmd.name.padEnd(25))} ${chalk.gray(cmd.method.padEnd(7))} ${cmd.path}`,
      );
      console.error(`  ${chalk.gray(cmd.description)}`);

      if (paramCount > 0) {
        const paramList = cmd.params!
          .map((p) => {
            const req = p.required ? chalk.red('*') : '';
            return `${p.name}${req} (${p.location}, ${p.type})`;
          })
          .join(', ');
        console.error(`  ${chalk.gray('Params:')} ${paramList}`);
      }

      if (requiredParams.length > 0) {
        const example = requiredParams.map((p) => `--${p.name} <${p.type}>`).join(' ');
        console.error(`  ${chalk.gray('Usage:')} stackrun call ${tool} ${cmd.name} ${example}`);
      }

      console.error('');
    }

    console.error(chalk.gray(`${manifest.commands.length} command(s) available.`));
  });
