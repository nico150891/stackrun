# Scratchpad

Session notes and discoveries go here.

---

## 2026-03-27 — Project Bootstrap

- Initialized project with Node 20 + TypeScript 5 + ESM
- Registry MVP: 3 tools (stripe, github, notion) as JSON files
- Using `type: "module"` in package.json for ESM support
- chalk v5 and ora v9 are ESM-only, so ESM is required

---

## 2026-04-01 — Phase 1 Complete

### Decisions
- **Lazy paths in storage.ts**: Paths (`getConfigDir()`, `getToolsDir()`, etc.) are computed via functions instead of module-level constants. This allows tests to mock `homedir()` from `node:os` — with ESM, module-level expressions evaluate at import time before mocks are ready. Negligible runtime overhead.
- **UX to stderr, data to stdout**: All visual output (chalk tables, ora spinners, messages) goes to stderr. Only `--json` mode writes to stdout. Enables clean piping: `stackrun search stripe --json | jq .`
- **Registry URL priority**: env var `STACKRUN_REGISTRY_URL` > `config.json` `registryUrl` > hardcoded default. Env var wins for CI/testing flexibility.

### Test coverage
- 9 storage tests (dirs, config, manifests, tokens with 0o600 permissions)
- 7 registry tests (URL resolution, fetch happy path, 404/ENOTFOUND/ETIMEDOUT errors)
- 3 CLI integration tests (search with query, no query, no match — all via --json)
- Total: 21 tests passing

---

## 2026-04-01 — Phase 2 Complete

### What was added
- `src/services/validator.ts` — manifest validation with structured errors (field, received, expected)
- `src/commands/install.ts` — fetch + validate + save, with `--force` flag
- `src/commands/uninstall.ts` — remove manifest + optional `--remove-token`, with `--yes` for CI/agents
- `src/commands/list.ts` — table with name/version/commands/auth status, `--json` flag
- `removeToolManifest(name)` added to storage.ts

### Decisions
- **Validator returns structured errors**: Each error has `{ field, received, expected }` — not just strings. This allows programmatic error handling in Phase 4 (call command) and makes `--json` error output easy to add later.
- **Uninstall skips prompt in non-TTY**: `process.stdin.isTTY` check — if false (piped, CI, agent), auto-confirms. Also supports `--yes` flag for explicit skip. Trade-off: less safe in pipes, but agents need non-interactive mode.
- **Install checks existing before fetching**: If tool is already installed and no `--force`, exits immediately without hitting the registry. Avoids unnecessary network call.

### Test coverage (cumulative)
- 14 validator tests (valid/invalid manifests, commands, params, path placeholders)
- 4 install tests (happy path, already installed, --force, invalid manifest)
- 3 integration tests (install→list→uninstall flow, empty list, uninstall nonexistent)
- Total: 47 tests passing

---

## 2026-04-01 — Phase 4 Complete

### What was added
- `src/services/auth.ts` — thin wrapper over storage's readTokens/writeTokens, with per-tool CRUD (save, get, remove, has)
- `src/commands/login.ts` — `--token` flag or interactive prompt, validates tool is installed and needs auth
- `src/commands/logout.ts` — removes token, graceful if none exists

### Decisions
- **Auth service as thin wrapper**: Rather than duplicating token file logic, auth.ts delegates to storage.ts. This keeps token file permissions (0o600) centralized in one place.
- **No token verification on login**: The plan mentions optional HEAD/GET verification, but executor doesn't exist yet. Deferred to Phase 4 where it can be done naturally.
- **Non-TTY guard on login**: If no `--token` flag and stdin is not a TTY (pipes, CI, agents), login exits with error and clear message. Prevents hanging on readline in non-interactive environments.

### Test coverage (cumulative)
- 7 auth tests (save, get, remove, has, overwrite, multi-tool isolation)
- 6 login/logout integration tests (happy path, not installed, auth none, non-TTY, overwrite, logout nonexistent)
- Total: 60 tests passing

---

## 2026-04-01 — Phase 4 Complete

### What was added
- `src/services/executor.ts` — HTTP execution engine with param routing (query/body/path), header merging, auth injection, and `HttpApiError` class for structured HTTP errors
- `src/commands/call.ts` — full call flow: load manifest → validate → find command → check auth → parse params → execute → display response

### Decisions
- **`allowUnknownOption` + `allowExcessArguments`**: Commander's `call` command uses both flags because user params (`--limit 5`) are unknown to Commander. `allowUnknownOption` lets `--limit` through but Commander still treats `5` as a positional arg excess — so `allowExcessArguments` is also needed. Params are parsed manually from `cmd.args` with a custom `parseParams` function.
- **`HttpApiError` custom class**: Carries `status` and `responseData` beyond the message string. This allows call.ts to output error response data as JSON in `--json` mode (useful for agents parsing API errors), and to set different exit codes (1 for auth, 2 for network/server).
- **Undocumented params pass through as query**: If a user passes `--foo bar` and `foo` isn't in the manifest's params, it goes to query string. This provides flexibility for APIs with undocumented or optional params not in the manifest.

### Test coverage (cumulative)
- 12 executor tests (GET, POST, query/body/path params, header merge, auth injection, 401/404/5xx errors, missing required param, network failure)
- 6 call integration tests (GET+query, POST+body, not installed, bad command, no token, 401 error)
- Total: 78 tests passing

---

## 2026-04-01 — Phase 5 Complete (technical tasks)

### What was added
- Global error handler (`uncaughtException` + `unhandledRejection`) in index.ts
- `stackrun schema <tool>` command — shows commands, auth, base URL, params with usage examples
- `--help` examples added to all 8 commands
- `--verbose` flag on `call` — shows URL, params, response time, content-type
- `--agent` flag on search/call/list/schema — forces JSON output, no spinners, no color
- Auto-detect pipe: `process.stdout.isTTY === false` triggers machine-readable mode
- 4 new registry manifests: slack, hubspot, sendgrid, linear (7 tools total)
- `npm run build` produces working `dist/` with all commands

### Decisions
- **Agent mode inline vs helper**: Started with a shared `output.ts` helper, but the logic was simple enough (ternary check `options.json || options.agent || !process.stdout.isTTY`) that it's cleaner inline in each command. Removed the unused helper.
- **`parseParams` knows about known flags**: The custom param parser in call.ts skips `--json`, `--verbose`, `--agent` so they don't leak as API params. This is simpler than trying to get Commander to parse them while also allowing unknown options.

### Community & release (completed)
- CONTRIBUTING.md with setup, code style, PR process
- Issue templates: bug report, feature request, new tool
- 3 good-first-issue issues: #1 Twilio manifest, #2 shell completions, #3 better error messages
- v0.1.0 tagged and released on GitHub

### Test coverage (cumulative)
- 2 schema tests (JSON output, not installed)
- Total: 80 tests passing

---

## 2026-04-01 — npm Publish & Real API Validation

### Publishing
- Package name `stackrun` was taken on npm — published as `@nico0891/stackrun`
- Added `publishConfig.access: "public"` in package.json (scoped packages are private by default)
- Created `.npmignore` to exclude src/, tests/, docs/, .claude/, internal docs from the tarball (75 files, 25.7 kB)
- Published v0.1.0 to npm: `npm install -g @nico0891/stackrun`

### Real API validation (3 APIs)
- **GitHub**: `get_user` returned profile (nico150891), `list_repos` returned repos sorted by updated
- **Stripe** (test mode): `get_balance` returned EUR balance, `create_customer` created `cus_UFs3k87OReyZ2Q` with email/name, `list_customers` confirmed creation
- **Notion**: `list_users` returned workspace user (Nico Leiva) + bot integration, `list_databases` returned empty (no shared databases)

### Repo hygiene
- stackrun repo set to public (was private)
- Removed `.claude/settings.json` from git tracking (local config, not project docs)
- Added badges to README (npm version, node version, license)
- Added install instructions, available tools table, and agent mode section to README

---

## 2026-04-01 — Phase 6A Complete (MCP Foundation)

### What was added
- `@modelcontextprotocol/sdk` v1.29.0 dependency (brings zod as transitive dep)
- `src/mcp/server.ts` — creates McpServer, reads installed manifests, registers each command as MCP tool with Zod input schemas generated from manifest params
- `src/mcp/handler.ts` — parses MCP tool names (`<tool>_<command>`), loads manifest, checks auth, delegates to executor, formats results as MCP CallToolResult
- `src/commands/mcp.ts` — `stackrun mcp` command (stdio transport) + `--list` flag to preview exposed tools
- Wired into `src/index.ts`

### Decisions
- **Tool naming convention**: `<tool>_<command>` (e.g., `stripe_list_customers`). The first `_` separates tool from command. For tools with hyphens (e.g., `hub-spot`), the handler tries progressively longer prefixes to find the right manifest.
- **Zod for input schemas**: The MCP SDK requires Zod schemas for tool input validation. We convert manifest `CommandParam[]` to Zod shapes dynamically: `string` → `z.string()`, `number` → `z.number()`, `boolean` → `z.boolean()`, with `.optional()` for non-required params.
- **100% executor reuse**: The handler converts MCP args to `Record<string, string>` and passes them directly to `executeCommand()`. No HTTP logic duplicated.
- **Error handling**: HttpApiError returns structured JSON (status, error, data). Network errors return plain text. Both use `isError: true` in MCP protocol.
- **`--list` flag on `stackrun mcp`**: Allows previewing what tools would be exposed without starting the server. Outputs human-readable to stderr, JSON to stdout when piped.
- **Server instructions**: MCP server includes instructions string explaining tool naming and auth flow, so agents can self-discover usage.

### Test coverage (cumulative)
- 4 parseMcpToolName tests (valid parse, no underscore, empty segments, single-word command)
- 8 handleToolCall tests (success, not installed, bad command, no token, HTTP error, network error, string conversion, auth none skip, invalid format)
- 4 createMcpServer tests (no tools, single manifest, multiple manifests, zero-arg commands)
- Total: 97 tests passing

---

## 2026-04-01 — Phase 6B Complete (Dynamic Tool Discovery)

### What was added
- **Dynamic tool sync**: `syncTools()` compares current manifests vs registered MCP tools, adds new ones and removes stale ones. Uses `RegisteredTool.remove()` from the SDK.
- **File watcher**: `watchToolsDirectory()` uses `fs.watch` on `~/.stackrun/tools/` with 300ms debounce. When JSON files change, triggers `syncTools()` automatically.
- **MCP resource template**: `stackrun://tools/{tool_name}` — agents can list all installed tools and read individual manifests via MCP resources protocol.
- **README MCP section**: Config examples for Claude Desktop, Claude Code, and Cursor.

### Decisions
- **`fs.watch` over polling**: Native file watching is efficient and immediate. The 300ms debounce prevents rapid-fire resyncs when multiple files change together (e.g., bulk install). If the directory doesn't exist, the watcher silently ignores — no tools installed yet.
- **Module-level `registeredTools` Map**: Tracks `Map<mcpToolName, RegisteredTool>`. This allows O(1) lookup for add/remove diffs. `clearRegisteredTools()` exposed for test isolation.
- **Resource template with `list` callback**: The list callback dynamically reads installed tools, so the resource list is always fresh. No caching needed — `readInstalledTools()` is fast (local filesystem).

### Test coverage (cumulative)
- 5 syncTools tests (add new, remove stale, idempotent, empty→tools, tools→empty)
- Total: 102 tests passing

---

## 2026-04-01 — Phase 6 Release & Validation

### Release
- Bumped version to 0.2.0 (package.json, index.ts, mcp/server.ts)
- Tagged v0.2.0, pushed to GitHub, published to npm as `@nico0891/stackrun@0.2.0`
- Fixed `.npmignore` to exclude `*-test-key.txt` files from tarball
- npm publish required granular access token with bypass 2FA (classic automation tokens no longer sufficient)

### Real agent validation (Claude Code + MCP)
- Registered MCP server: `claude mcp add --scope user stackrun -- node dist/index.js mcp`
- **Stripe**: `stripe_list_customers` via MCP → returned 1 customer (cus_UFs3k870ReyZ2Q, test@stackrun.dev)
- **GitHub**: `github_get_user` via MCP → returned profile (nico150891, Nicolás Leiva)
- Multi-tool confirmed: both Stripe and GitHub tools available simultaneously in the same MCP session
- MCP protocol working end-to-end: initialize → tools/list → tools/call → structured JSON response

---

## 2026-04-01 — Phase 7 Complete

### 7A — Registry Expansion
- 7 new manifests added (6 api_key/bearer + 1 OAuth2):
  - **Twilio** — send_sms, list_messages, get_message, list_calls (Basic auth, path params for account_sid)
  - **Jira** — search_issues (JQL), get_issue, create_issue, list_projects, get_myself (Basic auth, Atlassian API)
  - **Resend** — send_email, get_email, list_domains, list_api_keys (Bearer auth)
  - **Vercel** — list_projects, get_project, list_deployments, get_deployment, list_domains, list_env_vars (Bearer auth)
  - **Cloudflare** — verify_token, list_zones, list_dns_records, create_dns_record, list_workers (Bearer auth)
  - **OpenAI** — list_models, get_model, create_chat_completion, create_embedding, create_image (Bearer auth)
  - **Google** — list_emails, get_email, list_labels, list_events, list_files, get_user_profile (OAuth2)
- Registry now has 14 tools total

### 7B — OAuth2 Auth Type

#### What was added
- `OAuthTokenData` type in manifest.ts — stores access_token, refresh_token, expires_at, token_type
- `TokenStore` now accepts `string | OAuthTokenData` (backward compatible with existing api_key/bearer tokens)
- `src/services/oauth.ts` — full OAuth2 authorization code flow:
  - `runOAuthFlow()` — starts local HTTP server, calls `onAuthUrl` callback, waits for redirect, exchanges code
  - `refreshAccessToken()` — refreshes expired tokens using refresh_token grant
  - `buildAuthUrl()` — constructs the authorization URL with CSRF state param
- `src/services/auth.ts` — new functions: `saveOAuthToken()`, `getOAuthTokenData()`, `isTokenExpired()`
- `src/commands/login.ts` — detects `auth.type === 'oauth2'` and triggers browser flow
- `src/services/executor.ts` — auto-refreshes expired OAuth2 tokens before API calls
- Validator updated to accept `oauth2` and validate `auth_url`, `token_url`, `scopes`

#### Decisions
- **Callback-based auth URL delivery**: `runOAuthFlow` accepts an `onAuthUrl` callback instead of returning the URL. This allows the browser to open WHILE the server is waiting for the callback. Alternative was a two-step API (start server, then await code), but the callback pattern is cleaner for the caller.
- **Promise-free callback server**: The callback server uses a notify/store pattern instead of a shared Promise to avoid unhandled rejection errors in test environments. The `waitForCode()` function creates a fresh promise each time, reading from the stored result.
- **Token store polymorphism**: `TokenStore = Record<string, string | OAuthTokenData>`. Plain strings for api_key/bearer, objects for oauth2. `getToken()` always returns a string (the access_token for OAuth2). This keeps the executor interface unchanged.
- **60s expiry buffer**: `isTokenExpired()` considers a token expired 60 seconds before `expires_at`. This prevents edge cases where a request starts with a valid token but expires mid-flight.
- **Client credentials via env vars**: `STACKRUN_OAUTH_CLIENT_ID` and `STACKRUN_OAUTH_CLIENT_SECRET` env vars override manifest/flag values. Useful for CI and shared manifests where client_id shouldn't be hardcoded.

### Test coverage (cumulative)
- 3 OAuth token storage tests (save/retrieve, plain string fallback, nonexistent)
- 4 isTokenExpired tests (no expiry, valid, expired, 60s buffer)
- 5 validator OAuth2 tests (valid, missing auth_url/token_url/scopes, non-HTTPS)
- 2 buildAuthUrl tests (full URL, empty scopes)
- 6 runOAuthFlow tests (missing auth_url, no client_id, full flow with mock, state mismatch, error callback, timeout)
- Total: 122 tests passing

---

## 2026-04-01 — Phase 7D Complete (Security Hardening)

### Vulnerabilities found and fixed
1. **Command injection in `openBrowser()`** — `exec(xdg-open "${url}")` allowed shell metacharacter injection via malicious `auth_url`. Fixed: replaced `exec` with `execFile` which bypasses the shell entirely, passing the URL as a literal argument.
2. **Token leaking via HTTP redirects** — axios follows redirects by default. If an API redirects from HTTPS to HTTP, the Authorization header (with the token) would be sent in plaintext. Fixed: `maxRedirects: 0` for authenticated requests, `maxRedirects: 5` for unauthenticated ones.
3. **`--verbose` mode verified safe** — only logs URL, params, status, and content-type. Auth headers are never included in verbose output.

### Decisions
- **`maxRedirects: 0` for authenticated requests**: Trade-off: some APIs use 301/302 redirects legitimately (e.g., Stripe redirects old API paths). If this causes issues, we can add a smarter redirect handler that strips auth on cross-origin redirects. For now, the safer default wins.
- **Source code assertions in tests**: Some security tests read source files to verify invariants (e.g., `execFile` not `exec`, `127.0.0.1` binding). This is intentional — these are guards against future regressions that could introduce vulnerabilities.

### Test coverage (cumulative)
- 19 security tests: token storage (3), input validation (7), OAuth2 (2), network (5), command injection (1), plus the redirect fix test
- Total: 141 tests passing
