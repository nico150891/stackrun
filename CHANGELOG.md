# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- OAuth2 auth type with browser flow, token refresh, and Google manifest
- 7 new tool manifests: Twilio, Jira, Resend, Vercel, Cloudflare, OpenAI, Google
- Security hardening: command injection fix, redirect leak prevention, 19 security tests
- CI/CD pipeline: GitHub Actions with lint, typecheck, test (Node 20+22), build, audit
- Smoke test workflow for post-publish validation
- Edge case tests: race condition fix, large responses, filesystem errors
- Branch protection on `main` (required CI checks)
- LICENSE, SECURITY.md, CODE_OF_CONDUCT.md, PR template, CHANGELOG

### Fixed
- Command injection in `openBrowser()` — `exec()` replaced with `execFile()`
- Token leaking via HTTP redirects — disabled redirects for authenticated requests
- Token write race condition — added `withTokenLock()` mutex
- ESLint flat config migration (ESLint 10 compatibility)

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

[Unreleased]: https://github.com/nico150891/stackrun/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/nico150891/stackrun/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/nico150891/stackrun/releases/tag/v0.1.0
