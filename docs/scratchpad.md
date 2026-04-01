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
