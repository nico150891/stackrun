import { readdir, readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import chalk from 'chalk';
import type { ToolManifest } from '../types/manifest.js';

/** Lazily computed paths so mocks can override homedir() */
function getConfigDir(): string {
  return join(homedir(), '.stackrun');
}
function getToolsDir(): string {
  return join(getConfigDir(), 'tools');
}
function getConfigFile(): string {
  return join(getConfigDir(), 'config.json');
}
function getTokensFile(): string {
  return join(getConfigDir(), 'tokens.json');
}

export interface StackrunConfig {
  registryUrl?: string;
}

export type TokenStore = Record<string, string>;

/**
 * Ensures ~/.stackrun/ and ~/.stackrun/tools/ exist.
 * Creates them recursively if missing.
 */
export async function ensureConfigDir(): Promise<void> {
  try {
    await mkdir(getToolsDir(), { recursive: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not create config directory at ${getConfigDir()}`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Reads ~/.stackrun/config.json. Returns empty config if file doesn't exist. */
export async function readConfig(): Promise<StackrunConfig> {
  try {
    const data = await readFile(getConfigFile(), 'utf-8');
    return JSON.parse(data) as StackrunConfig;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return {};
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not read config at ${getConfigFile()}`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Writes ~/.stackrun/config.json. Creates the config dir if needed. */
export async function writeConfig(config: StackrunConfig): Promise<void> {
  await ensureConfigDir();
  try {
    await writeFile(getConfigFile(), JSON.stringify(config, null, 2) + '\n', 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not write config at ${getConfigFile()}`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Lists all installed tool manifests from ~/.stackrun/tools/*.json */
export async function readInstalledTools(): Promise<ToolManifest[]> {
  try {
    const files = await readdir(getToolsDir());
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    const manifests: ToolManifest[] = [];

    for (const file of jsonFiles) {
      const data = await readFile(join(getToolsDir(), file), 'utf-8');
      manifests.push(JSON.parse(data) as ToolManifest);
    }
    return manifests;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return [];
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not read installed tools`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Reads a specific installed tool manifest by name */
export async function readToolManifest(name: string): Promise<ToolManifest | null> {
  try {
    const filePath = join(getToolsDir(), `${name}.json`);
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as ToolManifest;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return null;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not read manifest for "${name}"`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Saves a tool manifest to ~/.stackrun/tools/<name>.json */
export async function saveToolManifest(manifest: ToolManifest): Promise<void> {
  await ensureConfigDir();
  try {
    const filePath = join(getToolsDir(), `${manifest.name}.json`);
    await writeFile(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not save manifest for "${manifest.name}"`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Removes an installed tool manifest by name. Returns true if removed, false if not found. */
export async function removeToolManifest(name: string): Promise<boolean> {
  try {
    const filePath = join(getToolsDir(), `${name}.json`);
    await unlink(filePath);
    return true;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return false;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not remove manifest for "${name}"`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Reads ~/.stackrun/tokens.json. Returns empty object if file doesn't exist. */
export async function readTokens(): Promise<TokenStore> {
  try {
    const data = await readFile(getTokensFile(), 'utf-8');
    return JSON.parse(data) as TokenStore;
  } catch (err) {
    if (isNodeError(err) && err.code === 'ENOENT') {
      return {};
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not read tokens`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Writes ~/.stackrun/tokens.json. Creates the config dir if needed. */
export async function writeTokens(tokens: TokenStore): Promise<void> {
  await ensureConfigDir();
  try {
    await writeFile(getTokensFile(), JSON.stringify(tokens, null, 2) + '\n', {
      encoding: 'utf-8',
      mode: 0o600,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`Error: could not write tokens`));
    console.error(chalk.red(`  ${message}`));
    throw err;
  }
}

/** Type guard for Node.js system errors with a `code` property */
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
