# Error Handling Conventions

## Rules

1. **Never use empty catch blocks.** Always handle the error or re-throw it.

2. **User-facing errors** must use chalk for formatting:
   - `chalk.red('Error: ...')` for fatal errors
   - `chalk.yellow('Warning: ...')` for non-fatal warnings
   - Always include actionable context (what failed, what to do next)

3. **UX output goes to stderr**, not stdout. This keeps `--json` output clean:
   ```ts
   console.error(chalk.red('Error: tool not found'));
   ```

4. **Network errors** should show a human-readable message, not the raw axios error:
   ```ts
   // Good
   "Could not reach registry. Check your internet connection."
   // Bad
   "AxiosError: getaddrinfo ENOTFOUND raw.githubusercontent.com"
   ```

5. **Exit codes:**
   - `0` — success
   - `1` — user error (bad input, missing token)
   - `2` — network/external error (registry down, API error)
