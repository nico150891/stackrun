# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-04-01

### Added
- **OAuth2 auth type** — browser flow with local callback server, automatic token refresh, CSRF protection via state param
- **7 new tool manifests** — Twilio, Jira, Resend, Vercel, Cloudflare, OpenAI, Google (14 tools total)
- **Security test suite** — 19 tests covering token storage, input validation, injection prevention, HTTPS enforcement
- **CI/CD pipeline** — GitHub Actions: lint, typecheck, test (Node 20+22), build, dependency audit
- **Smoke test workflow** — post-publish validation on Ubuntu + macOS
- **Edge case tests** — concurrent token writes, large responses, filesystem permission errors
- **Branch protection** — all PRs require CI to pass before merge
- **OSS hygiene** — LICENSE, SECURITY.md, CODE_OF_CONDUCT.md, CHANGELOG, PR template, issue templates

### Fixed
- **Command injection** in `openBrowser()` — `exec()` replaced with `execFile()`
- **Token leak via redirects** — disabled HTTP redirects for authenticated requests
- **Token write race condition** — concurrent `saveToken()` calls corrupted `tokens.json`, fixed with `withTokenLock()` mutex
- **Stale build artifacts** — `prebuild` script cleans `dist/` before compilation
- **ESLint 10 compatibility** — migrated to flat config format

## [0.2.0] - 2026-04-01

### Added
- MCP server — AI agents can use installed tools as native tool calls
- `stackrun mcp` command (stdio transport)
- `stackrun mcp --list` to preview exposed tools
- Dynamic tool discovery: install/uninstall while MCP server runs
- MCP resource template for tool schema inspection
- README section for Claude Desktop, Claude Code, and Cursor integration

## [0.1.0] - 2026-04-01

### Added
- Core CLI: `search`, `install`, `uninstall`, `list`, `login`, `logout`, `call`, `schema`
- Registry MVP with 7 tools: Stripe, GitHub, Notion, Slack, HubSpot, SendGrid, Linear
- Manifest validation with structured errors
- HTTP execution engine with param routing (query, body, path)
- Auth support: `none`, `api_key`, `bearer`
- `--json` and `--agent` flags for machine-readable output
- Auto-detect pipe mode (non-TTY defaults to JSON)
- `--verbose` flag for debug logging
- Global error handler
- Published to npm as `@nico0891/stackrun`

[Unreleased]: https://github.com/nico150891/stackrun/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/nico150891/stackrun/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/nico150891/stackrun/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nico150891/stackrun/releases/tag/v0.1.0
