/** Supported authentication types for MVP */
export type AuthType = 'none' | 'api_key' | 'bearer';

/** Authentication configuration for a SaaS tool */
export interface AuthConfig {
  type: AuthType;
  header?: string;
  prefix?: string;
}

/** A single API command exposed by a tool */
export interface ToolCommand {
  name: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  params?: CommandParam[];
  /** Per-command headers (merged with tool-level headers, command wins on conflict) */
  headers?: Record<string, string>;
}

/** Parameter definition for a command */
export interface CommandParam {
  name: string;
  description: string;
  required: boolean;
  location: 'query' | 'body' | 'path';
  type: 'string' | 'number' | 'boolean';
}

/** The manifest: central contract describing a SaaS tool */
export interface ToolManifest {
  name: string;
  version: string;
  description: string;
  base_url: string;
  auth: AuthConfig;
  /** Tool-level headers sent with every request (e.g., API version) */
  headers?: Record<string, string>;
  commands: ToolCommand[];
}

/** Registry index: list of available tools */
export interface RegistryIndex {
  tools: RegistryEntry[];
}

/** Single entry in the registry index */
export interface RegistryEntry {
  name: string;
  description: string;
  version: string;
}
