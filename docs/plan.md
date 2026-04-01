# Implementation Plan

## Overview

6 phases, each delivers a working increment. Each phase ends with passing tests and a usable CLI.

**CLI syntax convention:** `stackrun <command> <tool> [args...]` with space separation (not dot notation).

---

## Phase 1 — Foundation (storage + registry + search)

**Goal:** User can search tools from the registry.

### Tasks
- [x] `src/services/storage.ts` — create/read/write `~/.stackrun/` directory
  - `ensureConfigDir()` — creates `~/.stackrun/` and subdirs (`tools/`)
  - `readConfig()` / `writeConfig()` — manage `config.json`
  - `readInstalledTools()` — list `~/.stackrun/tools/*.json`
  - `readToolManifest(name)` — read a specific installed manifest
  - `saveToolManifest(manifest)` — write manifest to `tools/`
  - `readTokens()` / `writeTokens()` — manage `tokens.json`
- [x] `src/services/registry.ts` — fetch from GitHub raw URLs
  - Default registry URL hardcoded in code (GitHub raw), overridable via `config.json` or `STACKRUN_REGISTRY_URL` env var
  - `fetchIndex()` — GET `registry/index.json`, return `RegistryIndex`
  - `fetchManifest(name)` — GET `registry/<name>.json`, return `ToolManifest`
  - Validate response against types
  - Handle network errors with user-friendly messages
- [x] `src/commands/search.ts` — `stackrun search <query>`
  - Fetch registry index
  - Filter by name/description containing query
  - Display results as formatted table (chalk)
  - Support `--json` flag for machine-readable output
- [x] Wire `search` command into `src/index.ts`
- [x] Tests: unit tests for storage + registry, integration test for search (21 tests passing)

**Checkpoint:** `stackrun search stripe` returns results. ✅ Done (2026-04-01)

---

## Phase 2 — Install, Uninstall & List

**Goal:** User can install/remove tools locally and see what's installed.

### Tasks
- [x] `src/services/validator.ts` — manifest validation (reused by install + call)
  - `validateManifest(data)` — validates all required fields, returns errors array
  - `validateCommand(cmd)` — validates a single command definition
  - Rules: see `.claude/rules/manifest-validation.md`
  - On failure: show which field, what value was received, what was expected
- [x] `src/commands/install.ts` — `stackrun install <tool>`
  - Fetch manifest from registry
  - Validate manifest schema via validator service
  - Save to `~/.stackrun/tools/<name>.json`
  - Show success/error with ora spinner
- [x] `src/commands/uninstall.ts` — `stackrun uninstall <tool>`
  - Check tool is installed
  - Remove manifest from `~/.stackrun/tools/<name>.json`
  - Optionally remove associated token (prompt or `--remove-token` flag)
  - Confirm before removing
- [x] `src/commands/list.ts` — `stackrun list`
  - Read all installed tools from `~/.stackrun/tools/`
  - Display as formatted table (name, version, description, # commands, auth status)
  - Support `--json` flag
- [x] Wire `install`, `uninstall`, and `list` commands into `src/index.ts`
- [x] Tests: validator (valid + invalid manifests), install flow (mock HTTP), uninstall, list with 0/N tools (47 tests passing)

**Checkpoint:** `stackrun install stripe && stackrun list` shows stripe. `stackrun uninstall stripe` removes it. ✅ Done (2026-04-01)

---

## Phase 3 — Authentication

**Goal:** User can store and remove API tokens for installed tools.

### Tasks
- [x] `src/services/auth.ts` — token management
  - `saveToken(toolName, token)` — store in `tokens.json`
  - `getToken(toolName)` — retrieve token
  - `removeToken(toolName)` — delete token
  - `hasToken(toolName)` — check if token exists
  - Set file permissions to 600 on `tokens.json`
- [x] `src/commands/login.ts` — `stackrun login <tool>`
  - Check tool is installed
  - Read auth config from manifest
  - If `auth.type` is `none`, skip with message
  - Prompt for token (stdin), or accept `--token` flag
  - Store token via auth service
  - Token verification deferred to Phase 4 (needs executor)
- [x] `src/commands/logout.ts` — `stackrun logout <tool>`
  - Check tool has a stored token
  - Remove token via auth service
  - Confirm removal
- [x] Wire `login` and `logout` commands into `src/index.ts`
- [x] Tests: token CRUD, login flow with --token, logout (60 tests passing)

**Checkpoint:** `stackrun login stripe --token sk_test_xxx` stores the token. `stackrun logout stripe` removes it. ✅ Done (2026-04-01)

---

## Phase 4 — Execute API Calls

**Goal:** User can call any command defined in a tool manifest.

### Tasks
- [x] `src/services/executor.ts` — HTTP execution engine
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
- [x] `src/commands/call.ts` — `stackrun call <tool> <command> [--param value...]`
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
- [x] Wire `call` command into `src/index.ts`
- [x] Tests: executor with mocked axios (GET, POST, query/body/path params, headers merge, auth types), call command e2e (78 tests passing)

**Checkpoint:** `stackrun call stripe list_customers --limit 5` returns data. `stackrun call stripe create_customer --email test@example.com` creates a customer via POST. ✅ Done (2026-04-01)

---

## Phase 5 — Polish, Agent Mode & Release

**Goal:** CLI is robust, agent-friendly, documented, and publishable.

### Tasks

#### Core polish
- [x] Global error handler (uncaught exceptions → friendly message)
- [x] `--help` text for all commands with examples
- [x] `--verbose` flag for debug logging (full URL, headers sent, response time)
- [ ] Cross-platform testing (macOS + Linux + Windows)
- [x] `npm run build` produces working `dist/`
- [ ] Test `npm link` → `stackrun --help` works globally

#### Agent mode
- [x] `--agent` flag — forces JSON output, no spinners, no color
- [x] Auto-detect pipe: if `process.stdout.isTTY === false`, behave like `--agent`
- [ ] Validate that Claude Code / Codex can use stackrun as an external tool

#### `stackrun schema` command
- [x] `stackrun schema <tool>` — display the manifest of an installed tool
  - Show available commands, auth type, base URL, required headers
  - Support `--json` flag for machine-readable output
  - Useful for agents to discover what commands a tool exposes

#### Registry expansion
- [x] Add manifests: Slack, HubSpot, SendGrid, Linear
- [x] Update `registry/index.json` with new entries (7 tools total)

#### Community & release
- [x] `CONTRIBUTING.md` — how to contribute, code style, PR process
- [x] GitHub issue templates (bug report, feature request, new tool)
- [ ] GitHub Topics + repo metadata
- [x] 3 issues labeled `good first issue` for contributors (#1 Twilio, #2 shell completions, #3 error messages)
- [x] Update README with install instructions, tools table, agent mode, badges
- [x] Tag v0.1.0 + GitHub Release
- [x] Publish to npm as `@nico0891/stackrun`
- [x] Real API validation: GitHub, Stripe (test mode), Notion

**Checkpoint:** `npm run build` produces working `dist/`. 80 tests passing. v0.1.0 released. Published to npm. Validated with 3 real APIs. ✅ Done (2026-04-01)

---

## Phase 6 — MCP Server

**Goal:** Stackrun becomes an MCP server. Any AI agent (Claude, Cursor, etc.) can use installed tools as native tool calls — no bash parsing, fully structured.

**Why this first:** MCP is the biggest technical differentiator. One Stackrun MCP server replaces N individual MCP servers (one per API). Each manifest JSON automatically becomes MCP tools. This positions Stackrun as the universal bridge between AI agents and SaaS APIs.

### Tasks

#### 6A — MCP foundation
- [x] Add `@modelcontextprotocol/sdk` dependency
- [x] `src/mcp/server.ts` — MCP server that exposes installed tools as MCP tools
  - On startup: read all installed manifests from `~/.stackrun/tools/`
  - For each manifest command: register as an MCP tool with name `<tool>_<command>` (e.g., `stripe_list_customers`)
  - Tool description from manifest command description
  - Tool input schema generated from manifest params (name, type, required)
- [x] `src/mcp/handler.ts` — handles MCP tool calls
  - Receives tool name + params from the agent
  - Routes to the existing executor service (reuse 100% of Phase 4 code)
  - Returns structured JSON response
- [x] `stackrun mcp` command — starts the MCP server (stdio transport)
- [x] Tests: MCP server registers tools correctly, handles calls, returns structured responses (97 tests passing)

**Checkpoint:** Add to Claude Desktop config → agent can `stripe_list_customers` via Stackrun MCP. ✅ Done (2026-04-01)

#### 6B — Dynamic tool discovery
- [x] MCP server refreshes tool list when manifests change (install/uninstall)
- [x] `stackrun mcp --list` — show what tools would be exposed via MCP
- [x] Support MCP resource for tool schemas (agents can inspect before calling)

**Checkpoint:** Install a new tool while MCP server runs → agent immediately sees new commands. ✅ Done (2026-04-01)

#### 6C — Documentation & validation
- [x] README section: "Use with Claude Desktop / Cursor / Claude Code"
- [x] Example MCP config for Claude Desktop (`claude_desktop_config.json`)
- [x] Example MCP config for Cursor
- [x] Test with real agent: Claude Code calls Stripe via Stackrun MCP

**Checkpoint:** A user can follow the README and have Claude calling APIs via Stackrun in under 5 minutes. ✅ Done (2026-04-01)

---

## Phase 7 — Registry Expansion & OAuth2

**Goal:** More tools, and support for APIs that require OAuth2 (Google, Salesforce, etc.).

### Tasks

#### 7A — Registry expansion (no code changes needed)
- [x] Add manifests: Twilio, Jira, Resend, Vercel, Cloudflare, OpenAI
- [x] Update `registry/index.json` (14 tools total: 7 existing + 6 new api_key/bearer + 1 OAuth2)
- [ ] Each tool = content for a social media post

#### 7B — OAuth2 auth type
- [x] New auth type: `oauth2` in manifest schema
  - Fields: `auth_url`, `token_url`, `client_id`, `scopes`
- [x] `src/services/oauth.ts` — OAuth2 browser flow
  - Start local HTTP server on random port
  - Calls `onAuthUrl` callback for browser opening
  - Receive callback with auth code (CSRF protection via state param)
  - Exchange code for access token
  - Store token via auth service (supports `OAuthTokenData` with refresh_token + expires_at)
- [x] `stackrun login <tool>` detects `auth.type === 'oauth2'` and triggers browser flow
  - Supports `--client-id`, `--client-secret`, `--port` flags
  - Env vars: `STACKRUN_OAUTH_CLIENT_ID`, `STACKRUN_OAUTH_CLIENT_SECRET`
- [x] Token refresh logic (if refresh_token is provided)
  - Auto-refresh in executor before API calls when token is expired (60s buffer)
  - `refreshAccessToken()` in oauth.ts handles the refresh_token grant
- [x] Tests: OAuth2 flow with mocked browser/callback (20 new tests)
- [x] First OAuth2 tool: Google (Gmail, Calendar, Drive)

**Checkpoint:** `stackrun login google` opens browser, user authorizes, token is stored. `stackrun call google list_emails` works. 122 tests passing. ✅ Done (2026-04-01)

#### 7C — OAuth2 productization (pendiente)
- [ ] Crear proyecto OAuth2 de Stackrun en Google Cloud Console
- [ ] Embed `client_id` en el manifest de Google (Desktop app flow — sin necesidad de que el usuario cree credenciales)
- [ ] Pasar verificación de Google (requiere política de privacidad, scopes justificados)
- [ ] Evaluar PKCE como mejora de seguridad post-verificación
- [ ] Validar el flow real contra Google con una cuenta de prueba

**Checkpoint:** `stackrun login google` funciona sin flags ni configuración previa.

#### 7D — Security hardening

**Goal:** Encontrar y fixear vulnerabilidades antes de expandir el user base. Tests de seguridad automatizados que corren con el test suite.

##### Bugs encontrados y fixeados
- [x] **Command injection en `openBrowser()`**: `exec()` → `execFile()` (no shell interpolation)
- [x] **Token leaking via redirects**: `maxRedirects: 0` para requests autenticados (previene HTTPS→HTTP redirect leak)
- [x] **`--verbose` verificado**: solo muestra URL, params, status, content-type — nunca el auth header

##### Token storage security
- [x] Test: `tokens.json` tiene permisos `0o600` (solo lectura/escritura del owner)
- [x] Test: tokens no aparecen en stdout en ningún modo (`--json`, `--agent`, normal)
- [x] Test: tokens no se incluyen en la salida de `--verbose`

##### Input validation / injection
- [x] Test: manifest name con path traversal (`../../etc/passwd`) — rechazado por regex `[a-z0-9-]+`
- [x] Test: manifest name con slashes y dots — rechazado
- [x] Test: `base_url` path traversal normalizado por URL constructor
- [x] Test: path params con `../admin/delete` — `encodeURIComponent` los escapa
- [x] Test: param values con newlines (header injection) — safe porque van a body, no headers
- [x] Test: param values con null bytes — pasan a query, axios/Node los manejan

##### OAuth2 security
- [x] Test: callback server solo acepta requests en `127.0.0.1` (verificado en source)
- [x] Test: state mismatch rechaza el callback
- [x] Test: OAuth2 `token_url` y `auth_url` deben ser HTTPS

##### Network security
- [x] Test: todas las `base_url` en los 14 manifests del registry son HTTPS
- [x] Test: todos los manifests pasan validación
- [x] Test: redirects deshabilitados para requests autenticados (`maxRedirects: 0`)
- [x] Test: redirects permitidos para requests sin auth (`maxRedirects: 5`)
- [x] Test: `openBrowser` usa `execFile` (no `exec`)

**Checkpoint:** 141 tests passing. 3 vulnerabilidades fixeadas. 19 security tests automatizados. ✅ Done (2026-04-01)

---

## Phase 8 — CLI Polish & DX

**Goal:** Quality-of-life improvements for developers and agents.

### Tasks
- [ ] **Shell completions** — bash/zsh autocomplete for tool names and commands
- [ ] **`stackrun init`** — interactive wizard to scaffold a new tool manifest
  - Prompts for name, base_url, auth type
  - Asks for commands interactively
  - Generates valid JSON, validates with validator service
  - Optionally adds to registry/index.json
- [ ] **Encrypted token storage** — encrypt `tokens.json` at rest (V1 requirement)
  - Use OS keychain (macOS Keychain, Linux Secret Service) or local encryption with master password
- [ ] **`stackrun doctor`** — diagnostic command
  - Check Node.js version, config directory, installed tools, stored tokens, registry connectivity

**Checkpoint:** Contributors can create tools with `stackrun init`. Tokens are encrypted. Shell completions work.

---

## Phase 9 — Stackrun Cloud

**Goal:** Hosted layer on top of the CLI. Encrypted vault, team sharing, hosted registry. $49/team/month.

> Planning starts after MVP is validated (>200 stars, >100 installs/week).

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

## Future (beyond Cloud)

- **Plugin system** — custom pre/post hooks per tool
- **Official SaaS manifests** — partnerships with SaaS companies to maintain their own manifests
- **Marketplace** — community-maintained tools with ratings and reviews
- **Stackrun as npm library** — import and use programmatically, not just CLI
