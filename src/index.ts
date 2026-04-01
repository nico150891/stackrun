#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { searchCommand } from './commands/search.js';
import { installCommand } from './commands/install.js';
import { uninstallCommand } from './commands/uninstall.js';
import { listCommand } from './commands/list.js';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { callCommand } from './commands/call.js';
import { schemaCommand } from './commands/schema.js';

// Global error handler — friendly message instead of stack trace
process.on('uncaughtException', (err) => {
  console.error(chalk.red('Unexpected error:'), err.message);
  console.error(chalk.gray('If this persists, please report it at https://github.com/nico150891/stackrun/issues'));
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(chalk.red('Unexpected error:'), message);
  process.exit(1);
});

const program = new Command();

program
  .name('stackrun')
  .description('Universal CLI to install, authenticate and execute SaaS tools from terminal')
  .version('0.1.0');

program.addCommand(searchCommand);
program.addCommand(installCommand);
program.addCommand(uninstallCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(callCommand);
program.addCommand(listCommand);
program.addCommand(schemaCommand);

program.parse();
