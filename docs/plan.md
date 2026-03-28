# Implementation Plan

## Overview

6 phases, each delivers a working increment. Each phase ends with passing tests and a usable CLI.

**CLI syntax convention:** `stackrun <command> <tool> [args...]` with space separation (not dot notation).

---

## Phase 1 — Foundation (storage + registry + search)

**Goal:** User can search tools from the registry.

### Tasks
- [ ] `src/services/storage.ts` — create/read/write `~/.stackrun/` directory
  - `ensureConfigDir()` — creates `~/.stackrun/` and subdirs (`tools/`)
  - `readConfig()` / `writeConfig()` — manage `config.json`
  - `readInstalledTools()` — list `~/.stackrun/tools/*.json`
  - `readToolManifest(name)` — read a specific installed manifest
  - `saveToolManifest(manifest)` — write manifest to `tools/`
  - `readTokens()` / `writeTokens()` — manage `tokens.json`
- [ ] `src/services/registry.ts` — fetch from GitHub raw URLs
  - Default registry URL hardcoded in code (GitHub raw), overridable via `config.json` or `STACKRUN_REGISTRY_URL` env var
  - `fetchIndex()` — GET `registry/index.json`, return `RegistryIndex`
  - `fetchManifest(name)` — GET `registry/<name>.json`, return `ToolManifest`
  - Validate response against types
  - Handle network errors with user-friendly messages
- [ ] `src/commands/search.ts` — `stackrun search <query>`
  - Fetch registry index
  - Filter by name/description containing query
  - Display results as formatted table (chalk)
  - Support `--json` flag for machine-readable output
- [ ] Wire `search` command into `src/index.ts`
- [ ] Tests: unit tests for storage + registry, integration test for search

**Checkpoint:** `stackrun search stripe` returns results.

---

## Phase 2 — Install, Uninstall & List

**Goal:** User can install/remove tools locally and see what's installed.

### Tasks
- [ ] `src/services/validator.ts` — manifest validation (reused by install + call)
  - `validateManifest(data)` — validates all required fields, returns errors array
  - `validateCommand(cmd)` — validates a single command definition
  - Rules: see `.claude/rules/manifest-validation.md`
  - On failure: show which field, what value was received, what was expected
- [ ] `src/commands/install.ts` — `stackrun install <tool>`
  - Fetch manifest from registry
  - Validate manifest schema via validator service
  - Save to `~/.stackrun/tools/<name>.json`
  - Show success/error with ora spinner
- [ ] `src/commands/uninstall.ts` — `stackrun uninstall <tool>`
  - Check tool is installed
  - Remove manifest from `~/.stackrun/tools/<name>.json`
  - Optionally remove associated token (prompt or `--remove-token` flag)
  - Confirm before removing
- [ ] `src/commands/list.ts` — `stackrun list`
  - Read all installed tools from `~/.stackrun/tools/`
  - Display as formatted table (name, version, description, # commands, auth status)
  - Support `--json` flag
- [ ] Wire `install`, `uninstall`, and `list` commands into `src/index.ts`
- [ ] Tests: validator (valid + invalid manifests), install flow (mock HTTP), uninstall, list with 0/N tools

**Checkpoint:** `stackrun install stripe && stackrun list` shows stripe. `stackrun uninstall stripe` removes it.

---

## Phase 3 — Authentication

**Goal:** User can store and remove API tokens for installed tools.

### Tasks
- [ ] `src/services/auth.ts` — token management
  - `saveToken(toolName, token)` — store in `tokens.json`
  - `getToken(toolName)` — retrieve token
  - `removeToken(toolName)` — delete token
  - `hasToken(toolName)` — check if token exists
  - Set file permissions to 600 on `tokens.json`
- [ ] `src/commands/login.ts` — `stackrun login <tool>`
  - Check tool is installed
  - Read auth config from manifest
  - If `auth.type` is `none`, skip with message
  - Prompt for token (stdin), or accept `--token` flag
  - Store token via auth service
  - Verify token works (optional HEAD/GET request)
- [ ] `src/commands/logout.ts` — `stackrun logout <tool>`
  - Check tool has a stored token
  - Remove token via auth service
  - Confirm removal
- [ ] Wire `login` and `logout` commands into `src/index.ts`
- [ ] Tests: token CRUD, login flow with mock prompt, logout

**Checkpoint:** `stackrun login stripe --token sk_test_xxx` stores the token. `stackrun logout stripe` removes it.

---

## Phase 4 — Execute API Calls

**Goal:** User can call any command defined in a tool manifest.

### Tasks
- [ ] `src/services/executor.ts` — HTTP execution engine
  - Build full URL from `base_url` + command `path`
  - Replace path params (e.g., `/customers/:id` → `/customers/cus_123`)
  - Inject auth header from stored token (using manifest `auth.header` + `auth.prefix`)
  - Merge headers: tool-level `headers` + command-level `headers` (command wins on conflict) + auth header
  - Route user params by `location` field in manifest:
    - `query` → URL query string
    - `body` → request body
    - `path` → replace `:param` in URL path
  - Execute with axios
  - Return structured response: `{ status, headers, data }`
- [ ] `src/commands/call.ts` — `stackrun call <tool> <command> [--param value...]`
  - Load installed manifest (validate via validator service)
  - Find command by name (error if not found, suggest similar)
  - Check auth: if tool requires auth and no token stored, error with `"Run: stackrun login <tool>"`
  - Parse CLI params (`--key value`) — user doesn't need to know if param is query/body/path, the manifest handles routing
  - Execute via executor service
  - Display response:
    - **Human mode** (default): formatted table, colored status code
    - **JSON mode** (`--json`): clean JSON to stdout, all UX (spinner, status) to stderr
  - HTTP error handling (not raw axios errors):
    - 401 → `"Authentication failed. Run: stackrun login <tool>"`
    - 404 → `"Endpoint not found: <path>"`
    - 429 → `"Rate limited. Retry after X seconds."`
    - 5xx → `"<Tool> API error (<code>). Try again later."`
- [ ] Wire `call` command into `src/index.ts`
- [ ] Tests: executor with mocked axios (GET, POST, query/body/path params, headers merge, auth types), call command e2e

**Checkpoint:** `stackrun call stripe list_customers --limit 5` returns data. `stackrun call stripe create_customer --email test@example.com` creates a customer via POST.

---

## Phase 5 — Polish, Agent Mode & Release

**Goal:** CLI is robust, agent-friendly, documented, and publishable.

### Tasks

#### Core polish
- [ ] Global error handler (uncaught exceptions → friendly message)
- [ ] `--help` text for all commands with examples
- [ ] `--verbose` flag for debug logging (full URL, headers sent, response time)
- [ ] Cross-platform testing (macOS + Linux + Windows)
- [ ] `npm run build` produces working `dist/`
- [ ] Test `npm link` → `stackrun --help` works globally

#### Agent mode
- [ ] `--agent` flag — forces JSON output, no spinners, no color
- [ ] Auto-detect pipe: if `process.stdout.isTTY === false`, behave like `--agent`
- [ ] Validate that Claude Code / Codex can use stackrun as an external tool

#### `stackrun schema` command
- [ ] `stackrun schema <tool>` — display the manifest of an installed tool
  - Show available commands, auth type, base URL, required headers
  - Support `--json` flag for machine-readable output
  - Useful for agents to discover what commands a tool exposes

#### Registry expansion
- [ ] Add manifests: Slack, HubSpot, SendGrid, Linear
- [ ] Update `registry/index.json` with new entries

#### Community & release
- [ ] `CONTRIBUTING.md` — how to contribute, code style, PR process
- [ ] GitHub issue templates (bug report, feature request, new tool)
- [ ] GitHub Topics + repo metadata
- [ ] 3 issues labeled `good first issue` for contributors
- [ ] Update README with GIF demo + real usage examples
- [ ] Tag v0.1.0 + GitHub Release

**Checkpoint:** `npm pack` produces a publishable package. `stackrun call stripe list_customers | jq .` works in a pipe. Agents can discover and use tools programmatically.

---

## Phase 6 — Stackrun Cloud (V1)

**Goal:** Hosted layer on top of the CLI. Encrypted vault, team sharing, hosted registry. $49/team/month.

> This is a separate product built on top of the CLI. Planning starts after MVP is validated (>200 stars, >100 installs/week).

### Modules (high-level, to be detailed when we get here)
- [ ] **Auth service** — user registration, login, sessions (likely Supabase or custom)
- [ ] **Encrypted token vault** — store tokens server-side, encrypted at rest
- [ ] **Hosted registry** — private tools per team, versioning, search API
- [ ] **Team management** — invite members, roles, shared tools + tokens
- [ ] **Usage logs** — call history, dashboard with basic analytics
- [ ] **Billing** — Stripe Checkout, subscription management, free tier
- [ ] **CLI integration** — `stackrun cloud login`, `stackrun cloud push`, sync local ↔ cloud

### Technical decisions (TBD)
- Backend: Node.js API vs edge functions (Cloudflare Workers / Vercel)
- Database: Postgres (Supabase / Neon) vs serverless
- Auth: Supabase Auth vs custom JWT
- Infra: what gives us the fastest path to MVP with lowest cost

**Checkpoint:** A team can sign up, store tokens in the cloud, share tools, and see call logs. Billing works.

---

## Future (beyond V1)

- **OAuth2 auth type** — browser flow with local callback server
- **Plugin system** — custom pre/post hooks per tool
- **Autocomplete** — shell completions for installed tools and commands
- **`stackrun init`** — scaffold a new tool manifest interactively
- **Official SaaS manifests** — partnerships with SaaS companies to maintain their own manifests
- **Marketplace** — community-maintained tools with ratings and reviews
