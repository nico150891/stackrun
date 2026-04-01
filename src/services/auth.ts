import { readTokens, writeTokens } from './storage.js';

/** Stores a token for a specific tool */
export async function saveToken(toolName: string, token: string): Promise<void> {
  const tokens = await readTokens();
  tokens[toolName] = token;
  await writeTokens(tokens);
}

/** Retrieves the stored token for a tool, or null if not found */
export async function getToken(toolName: string): Promise<string | null> {
  const tokens = await readTokens();
  return tokens[toolName] ?? null;
}

/** Removes the stored token for a tool. Returns true if it existed. */
export async function removeToken(toolName: string): Promise<boolean> {
  const tokens = await readTokens();
  if (!(toolName in tokens)) return false;
  delete tokens[toolName];
  await writeTokens(tokens);
  return true;
}

/** Checks whether a token exists for a tool */
export async function hasToken(toolName: string): Promise<boolean> {
  const tokens = await readTokens();
  return toolName in tokens;
}
