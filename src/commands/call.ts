import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readToolManifest } from '../services/storage.js';
import { getToken } from '../services/auth.js';
import { validateManifest, formatValidationErrors } from '../services/validator.js';
import { executeCommand, HttpApiError } from '../services/executor.js';

export const callCommand = new Command('call')
  .description('Execute an API call to a SaaS tool')
  .argument('<tool>', 'Tool name')
  .argument('<command>', 'Command to execute')
  .option('--json', 'Output response as JSON to stdout')
  .option('--agent', 'Machine-readable output (no spinners, no color)')
  .option('--verbose', 'Show debug info (URL, headers, response time)')
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .addHelpText('after', `
Examples:
  $ stackrun call stripe list_customers --limit 10
  $ stackrun call stripe create_customer --email user@test.com
  $ stackrun call stripe list_customers --json | jq .
  $ stackrun call stripe list_customers --verbose`)
  .action(async (tool: string, commandName: string, options: { json?: boolean; agent?: boolean; verbose?: boolean }, cmd: Command) => {
    const isJson = options.json || options.agent || !process.stdout.isTTY;
    const isVerbose = options.verbose ?? false;

    // Load manifest
    const manifest = await readToolManifest(tool);
    if (!manifest) {
      console.error(chalk.red(`Error: tool "${tool}" is not installed.`));
      console.error(chalk.gray(`Run: stackrun install ${tool}`));
      process.exitCode = 1;
      return;
    }

    // Validate manifest
    const errors = validateManifest(manifest as unknown as Record<string, unknown>);
    if (errors.length > 0) {
      console.error(chalk.red(`Invalid manifest for "${tool}":`));
      for (const line of formatValidationErrors(errors)) {
        console.error(chalk.red(line));
      }
      process.exitCode = 1;
      return;
    }

    // Find command
    const toolCommand = manifest.commands.find((c) => c.name === commandName);
    if (!toolCommand) {
      console.error(chalk.red(`Error: command "${commandName}" not found in "${tool}".`));
      const similar = manifest.commands
        .filter((c) => c.name.includes(commandName) || commandName.includes(c.name))
        .map((c) => c.name);
      if (similar.length > 0) {
        console.error(chalk.gray(`Did you mean: ${similar.join(', ')}?`));
      }
      console.error(chalk.gray(`Available commands: ${manifest.commands.map((c) => c.name).join(', ')}`));
      process.exitCode = 1;
      return;
    }

    // Check auth
    const token = manifest.auth.type !== 'none' ? await getToken(tool) : null;
    if (manifest.auth.type !== 'none' && !token) {
      console.error(chalk.red(`Error: no token found for "${tool}".`));
      console.error(chalk.gray(`Run: stackrun login ${tool}`));
      process.exitCode = 1;
      return;
    }

    // Parse user params from remaining args (--key value pairs)
    const params = parseParams(cmd.args.slice(2));

    if (isVerbose) {
      console.error(chalk.gray(`[verbose] ${toolCommand.method} ${manifest.base_url}${toolCommand.path}`));
      if (Object.keys(params).length > 0) {
        console.error(chalk.gray(`[verbose] Params: ${JSON.stringify(params)}`));
      }
    }

    const spinner = isJson ? null : ora(`Calling ${tool} ${commandName}...`).start();
    const startTime = Date.now();

    try {
      const result = await executeCommand({
        manifest,
        command: toolCommand,
        params,
        token,
      });

      spinner?.stop();

      if (isVerbose) {
        const elapsed = Date.now() - startTime;
        console.error(chalk.gray(`[verbose] Response: ${result.status} in ${elapsed}ms`));
        const contentType = result.headers['content-type'] ?? 'unknown';
        console.error(chalk.gray(`[verbose] Content-Type: ${contentType}`));
      }

      if (isJson) {
        process.stdout.write(JSON.stringify(result.data, null, 2) + '\n');
        return;
      }

      // Human-readable output
      const statusColor = result.status < 300 ? chalk.green : chalk.yellow;
      console.error(statusColor(`${result.status} OK`));
      console.error('');
      console.error(JSON.stringify(result.data, null, 2));
    } catch (err) {
      spinner?.fail(`Failed to call ${tool} ${commandName}`);

      if (isVerbose) {
        const elapsed = Date.now() - startTime;
        console.error(chalk.gray(`[verbose] Failed after ${elapsed}ms`));
      }

      if (err instanceof HttpApiError) {
        console.error(chalk.red(`Error: ${err.message}`));
        if (isJson && err.responseData) {
          process.stdout.write(JSON.stringify(err.responseData, null, 2) + '\n');
        }
        process.exitCode = err.status === 401 ? 1 : 2;
        return;
      }

      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`Error: ${message}`));
      process.exitCode = 2;
    }
  });

/**
 * Parses --key value pairs from raw CLI args.
 * Supports: --key value, --key=value
 */
function parseParams(args: string[]): Record<string, string> {
  const params: Record<string, string> = {};
  const knownFlags = new Set(['json', 'verbose', 'agent']);
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        if (!knownFlags.has(key)) {
          params[key] = arg.slice(eqIdx + 1);
        }
      } else {
        const key = arg.slice(2);
        if (knownFlags.has(key)) {
          // skip known flags
        } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          params[key] = args[i + 1];
          i++;
        } else {
          params[key] = 'true';
        }
      }
    }
    i++;
  }
  return params;
}
