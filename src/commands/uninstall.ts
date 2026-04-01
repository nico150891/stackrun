import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import {
  readToolManifest,
  removeToolManifest,
  readTokens,
  writeTokens,
} from '../services/storage.js';

/** Prompts user for yes/no confirmation via stdin */
async function confirm(message: string): Promise<boolean> {
  // Skip prompt in non-TTY (pipes, CI, agents)
  if (!process.stdin.isTTY) return true;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export const uninstallCommand = new Command('uninstall')
  .description('Remove an installed tool')
  .argument('<tool>', 'Tool name to uninstall')
  .option('--remove-token', 'Also remove the stored token for this tool')
  .option('--yes', 'Skip confirmation prompt')
  .addHelpText(
    'after',
    `
Examples:
  $ stackrun uninstall stripe                  # remove tool (with confirmation)
  $ stackrun uninstall stripe --yes            # skip confirmation
  $ stackrun uninstall stripe --remove-token   # also remove stored token`,
  )
  .action(async (tool: string, options: { removeToken?: boolean; yes?: boolean }) => {
    const manifest = await readToolManifest(tool);
    if (!manifest) {
      console.error(chalk.red(`Error: tool "${tool}" is not installed.`));
      process.exitCode = 1;
      return;
    }

    if (!options.yes) {
      const confirmed = await confirm(`Uninstall ${chalk.cyan(tool)} v${manifest.version}?`);
      if (!confirmed) {
        console.error(chalk.yellow('Cancelled.'));
        return;
      }
    }

    const removed = await removeToolManifest(tool);
    if (!removed) {
      console.error(chalk.red(`Error: could not remove "${tool}".`));
      process.exitCode = 1;
      return;
    }

    if (options.removeToken) {
      const tokens = await readTokens();
      if (tokens[tool]) {
        delete tokens[tool];
        await writeTokens(tokens);
        console.error(chalk.green(`Removed token for "${tool}".`));
      }
    }

    console.error(chalk.green(`Uninstalled "${tool}".`));
  });
