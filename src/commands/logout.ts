import { Command } from 'commander';
import chalk from 'chalk';
import { removeToken } from '../services/auth.js';

export const logoutCommand = new Command('logout')
  .description('Remove stored token for a tool')
  .argument('<tool>', 'Tool name to remove token for')
  .addHelpText(
    'after',
    `
Examples:
  $ stackrun logout stripe   # remove stored token`,
  )
  .action(async (tool: string) => {
    const removed = await removeToken(tool);
    if (!removed) {
      console.error(chalk.yellow(`No token found for "${tool}".`));
      return;
    }
    console.error(chalk.green(`Token removed for "${tool}".`));
  });
