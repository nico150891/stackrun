# Implementation Plan

## Overview

5 phases, each delivers a working increment. Each phase ends with passing tests and a usable CLI.

---

## Phase 1 — Foundation (storage + registry + search)

**Goal:** User can search tools from the registry.

### Tasks
- [ ] `src/services/storage.ts` — create/read/write `~/.stackrun/` directory
  - `ensureConfigDir()` — creates `~/.stackrun/` and subdirs
  - `readConfig()` / `writeConfig()` — manage `config.json`
  - `readInstalledTools()` — list `~/.stackrun/tools/*.json`
  - `readToolManifest(name)` — read a specific installed manifest
  - `saveToolManifest(manifest)` — write manifest to `tools/`
  - `readTokens()` / `writeTokens()` — manage `tokens.json`
- [ ] `src/services/registry.ts` — fetch from GitHub raw URLs
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

## Phase 2 — Install & List

**Goal:** User can install tools locally and see what's installed.

### Tasks
- [ ] `src/commands/install.ts` — `stackrun install <tool>`
  - Fetch manifest from registry
  - Validate manifest schema
  - Save to `~/.stackrun/tools/<name>.json`
  - Show success/error with ora spinner
- [ ] `src/commands/list.ts` — `stackrun list`
  - Read all installed tools from `~/.stackrun/tools/`
  - Display as formatted table
  - Support `--json` flag
- [ ] Wire `install` and `list` commands into `src/index.ts`
- [ ] Tests: install flow (mock HTTP), list with 0/N tools

**Checkpoint:** `stackrun install stripe && stackrun list` shows stripe.

---

## Phase 3 — Authentication

**Goal:** User can store API tokens for installed tools.

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
  - Prompt for token (stdin, or `--token` flag)
  - Store token via auth service
  - Verify token works (optional HEAD/GET request)
- [ ] Wire `login` command into `src/index.ts`
- [ ] Tests: token CRUD, login flow with mock prompt

**Checkpoint:** `stackrun login stripe --token sk_test_xxx` stores the token.

---

## Phase 4 — Execute API Calls

**Goal:** User can call any command defined in a tool manifest.

### Tasks
- [ ] `src/services/executor.ts` — HTTP execution engine
  - Build full URL from `base_url` + command `path`
  - Inject auth header from stored token
  - Map params to query string, body, or path params
  - Execute with axios
  - Return structured response (status, headers, body)
- [ ] `src/commands/call.ts` — `stackrun call <tool> <command> [params...]`
  - Load installed manifest
  - Find command by name
  - Parse CLI params (`--key value`)
  - Execute via executor service
  - Display response (formatted or `--json` raw)
  - UX output (spinner, status) to stderr
- [ ] Wire `call` command into `src/index.ts`
- [ ] Tests: executor with mocked axios, call command e2e

**Checkpoint:** `stackrun call stripe list_customers --limit 5` returns data.

---

## Phase 5 — Polish & Release

**Goal:** CLI is robust, documented, and publishable.

### Tasks
- [ ] Global error handler (uncaught exceptions → friendly message)
- [ ] `--help` text for all commands with examples
- [ ] `--verbose` flag for debug logging
- [ ] Validate all manifests in `registry/` on CI (optional)
- [ ] `npm run build` produces working `dist/`
- [ ] Test `npm link` → `stackrun --help` works globally
- [ ] Update README with real usage examples
- [ ] Tag v0.1.0

**Checkpoint:** `npm pack` produces a publishable package.

---

## Future (V1)

These are out of scope for MVP but documented for planning:

- **OAuth2 auth type** — browser flow with local callback server
- **Encrypted token storage** — use `crypto` module or OS keychain
- **Registry API** — proper backend with search, versioning, rate limiting
- **Plugin system** — custom pre/post hooks per tool
- **Autocomplete** — shell completions for installed tools and commands
- **`stackrun init`** — scaffold a new tool manifest interactively
