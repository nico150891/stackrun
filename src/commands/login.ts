import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { readToolManifest } from '../services/storage.js';
import { saveToken, hasToken } from '../services/auth.js';

/** Prompts for a token via stdin (hidden input in TTY) */
async function promptToken(toolName: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`Enter API token for ${toolName}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export const loginCommand = new Command('login')
  .description('Store authentication token for a tool')
  .argument('<tool>', 'Tool name to authenticate')
  .option('--token <token>', 'Provide token directly (instead of prompt)')
  .addHelpText('after', `
Examples:
  $ stackrun login stripe                       # interactive prompt
  $ stackrun login stripe --token sk_test_xxx   # provide token directly`)
  .action(async (tool: string, options: { token?: string }) => {
    const manifest = await readToolManifest(tool);
    if (!manifest) {
      console.error(chalk.red(`Error: tool "${tool}" is not installed.`));
      console.error(chalk.gray(`Run: stackrun install ${tool}`));
      process.exitCode = 1;
      return;
    }

    if (manifest.auth.type === 'none') {
      console.error(chalk.yellow(`Tool "${tool}" does not require authentication.`));
      return;
    }

    // Warn if token already exists
    const existing = await hasToken(tool);
    if (existing) {
      console.error(chalk.yellow(`Token for "${tool}" already exists. It will be overwritten.`));
    }

    // Get token from flag or prompt
    let token = options.token;
    if (!token) {
      if (!process.stdin.isTTY) {
        console.error(chalk.red('Error: no token provided. Use --token <value> in non-interactive mode.'));
        process.exitCode = 1;
        return;
      }
      token = await promptToken(tool);
    }

    if (!token) {
      console.error(chalk.red('Error: token cannot be empty.'));
      process.exitCode = 1;
      return;
    }

    await saveToken(tool, token);
    console.error(chalk.green(`Token saved for "${tool}".`));
  });
