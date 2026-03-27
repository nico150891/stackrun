#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
  .name('stackrun')
  .description('Universal CLI to install, authenticate and execute SaaS tools from terminal')
  .version('0.1.0');

// Commands will be registered here as they are implemented
// program.addCommand(searchCommand);
// program.addCommand(installCommand);
// program.addCommand(loginCommand);
// program.addCommand(callCommand);
// program.addCommand(listCommand);

program.parse();
