import axios, { AxiosError } from 'axios';
import { readConfig } from './storage.js';
import type { RegistryIndex, ToolManifest } from '../types/manifest.js';

const DEFAULT_REGISTRY_URL = 'https://raw.githubusercontent.com/nico150891/stackrun/main/registry';

/**
 * Resolves the registry base URL.
 * Priority: STACKRUN_REGISTRY_URL env > config.json registryUrl > default.
 */
export async function getRegistryUrl(): Promise<string> {
  const envUrl = process.env['STACKRUN_REGISTRY_URL'];
  if (envUrl) return envUrl;

  const config = await readConfig();
  if (config.registryUrl) return config.registryUrl;

  return DEFAULT_REGISTRY_URL;
}

/** Fetches the registry index (list of available tools) */
export async function fetchIndex(): Promise<RegistryIndex> {
  const baseUrl = await getRegistryUrl();
  const url = `${baseUrl}/index.json`;

  try {
    const response = await axios.get<RegistryIndex>(url);
    return response.data;
  } catch (err) {
    throw new Error(formatNetworkError(err, 'registry index'));
  }
}

/** Fetches a single tool manifest by name from the registry */
export async function fetchManifest(name: string): Promise<ToolManifest> {
  const baseUrl = await getRegistryUrl();
  const url = `${baseUrl}/${name}.json`;

  try {
    const response = await axios.get<ToolManifest>(url);
    return response.data;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) {
      throw new Error(`Tool "${name}" not found in the registry.`);
    }
    throw new Error(formatNetworkError(err, `manifest for "${name}"`));
  }
}

/** Translates raw network errors into human-readable messages */
function formatNetworkError(err: unknown, context: string): string {
  if (err instanceof AxiosError) {
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return `Could not reach registry. Check your internet connection.`;
    }
    if (err.response) {
      return `Failed to fetch ${context}: HTTP ${err.response.status}`;
    }
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
      return `Request timed out while fetching ${context}. Try again later.`;
    }
    return `Network error while fetching ${context}. Check your internet connection.`;
  }
  const message = err instanceof Error ? err.message : String(err);
  return `Unexpected error fetching ${context}: ${message}`;
}
