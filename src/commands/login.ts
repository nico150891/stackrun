import { Command } from 'commander';
import chalk from 'chalk';
import { createInterface } from 'node:readline';
import { exec } from 'node:child_process';
import { readToolManifest } from '../services/storage.js';
import { saveToken, saveOAuthToken, hasToken } from '../services/auth.js';
import { runOAuthFlow } from '../services/oauth.js';

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

/** Opens a URL in the default browser */
function openBrowser(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${url}"`);
}

export const loginCommand = new Command('login')
  .description('Store authentication token for a tool')
  .argument('<tool>', 'Tool name to authenticate')
  .option('--token <token>', 'Provide token directly (instead of prompt)')
  .option('--client-id <id>', 'OAuth2 client ID (overrides manifest)')
  .option('--client-secret <secret>', 'OAuth2 client secret')
  .option('--port <port>', 'Port for OAuth2 callback server (default: random)')
  .addHelpText('after', `
Examples:
  $ stackrun login stripe                       # interactive prompt
  $ stackrun login stripe --token sk_test_xxx   # provide token directly
  $ stackrun login google                       # opens browser for OAuth2
  $ stackrun login google --client-id xxx --client-secret yyy`)
  .action(async (tool: string, options: { token?: string; clientId?: string; clientSecret?: string; port?: string }) => {
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

    // OAuth2 flow
    if (manifest.auth.type === 'oauth2') {
      await handleOAuth2Login(tool, manifest.auth, options);
      return;
    }

    // API key / bearer flow
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

/** Handles the OAuth2 browser-based login flow */
async function handleOAuth2Login(
  tool: string,
  auth: import('../types/manifest.js').AuthConfig,
  options: { clientId?: string; clientSecret?: string; port?: string },
): Promise<void> {
  const clientId = options.clientId ?? process.env.STACKRUN_OAUTH_CLIENT_ID ?? auth.client_id;
  const clientSecret = options.clientSecret ?? process.env.STACKRUN_OAUTH_CLIENT_SECRET;

  if (!clientId) {
    console.error(chalk.red('Error: OAuth2 requires a client_id.'));
    console.error(chalk.gray('Provide it via --client-id, STACKRUN_OAUTH_CLIENT_ID env var, or in the manifest.'));
    process.exitCode = 1;
    return;
  }

  console.error(chalk.cyan(`Starting OAuth2 flow for "${tool}"...`));

  try {
    const tokenData = await runOAuthFlow({
      toolName: tool,
      auth,
      clientId,
      clientSecret,
      port: options.port ? parseInt(options.port, 10) : undefined,
      onAuthUrl: (url) => {
        console.error(chalk.cyan('Opening browser for authorization...'));
        console.error(chalk.gray(`If the browser doesn't open, visit:\n${url}`));
        openBrowser(url);
      },
    });

    await saveOAuthToken(tool, tokenData);

    console.error(chalk.green(`OAuth2 token saved for "${tool}".`));
    if (tokenData.refresh_token) {
      console.error(chalk.gray('Refresh token stored — token will be renewed automatically.'));
    }
    if (tokenData.expires_at) {
      const expiresDate = new Date(tokenData.expires_at * 1000);
      console.error(chalk.gray(`Token expires: ${expiresDate.toLocaleString()}`));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`OAuth2 login failed: ${message}`));
    process.exitCode = 1;
  }
}
