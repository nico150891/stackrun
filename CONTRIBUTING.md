# Contributing to Stackrun

Thanks for your interest in contributing! Here's everything you need to get started.

## Development Setup

```bash
git clone https://github.com/nico150891/stackrun.git
cd stackrun
npm install
npm run dev -- --help
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run CLI in development mode (ts-node) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run all tests (vitest) |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run typecheck` | Type check without emitting |

## Code Style

- **TypeScript** with strict mode enabled
- **ESM** — `import`/`export`, no CommonJS
- **Explicit types** on all public functions — no `any` unless justified with a comment
- **Comments and docstrings in English**
- **UX output to stderr**, data output to stdout — this keeps `--json` output clean for piping
- **No empty catch blocks** — always handle errors with user-friendly messages via chalk

## Project Structure

```
src/
├── commands/       # One file per CLI command
├── services/       # Reusable business logic
├── types/          # TypeScript type definitions
└── index.ts        # Entry point, registers commands

registry/           # Tool manifest JSONs (the MVP registry)
tests/
├── unit/           # Service-level tests
└── integration/    # CLI command tests (mock HTTP)
```

## Adding a New SaaS Tool

1. Create `registry/<tool-name>.json` following the manifest schema (see `src/types/manifest.ts`)
2. Add an entry to `registry/index.json`
3. Validate your manifest passes `validateManifest()` from `src/services/validator.ts`
4. Open a PR

See `.claude/skills/add-new-tool.md` for the full workflow.

## Testing

### Running tests

```bash
npm test                          # run all tests
npm test -- --run tests/unit/     # run only unit tests
npm test -- --coverage            # run with coverage report
npm run test:watch                # watch mode during development
```

### Test structure

```
tests/
├── unit/                    # Service-level tests (isolated, fast)
│   ├── storage.test.ts      # File system operations
│   ├── registry.test.ts     # Registry fetch logic
│   ├── auth.test.ts         # Token CRUD
│   ├── executor.test.ts     # HTTP execution engine
│   ├── validator.test.ts    # Manifest validation
│   ├── oauth.test.ts        # OAuth2 flow (mock browser/callback)
│   ├── mcp-server.test.ts   # MCP server tool registration
│   ├── mcp-handler.test.ts  # MCP tool call handling
│   ├── install.test.ts      # Install command logic
│   ├── security.test.ts     # Security: injection, token leaking, redirects
│   └── edge-cases.test.ts   # Race conditions, large responses, permissions
└── integration/             # CLI command tests (end-to-end, mock HTTP)
    ├── cli.test.ts          # Search command
    ├── install-list-uninstall.test.ts
    ├── login-logout.test.ts
    ├── call.test.ts
    └── schema.test.ts
```

### Conventions

- **vitest** with `describe`/`it`/`expect` pattern
- **Mock `homedir()`** from `node:os` for any test touching `~/.stackrun/` — use a tmpdir, clean up in `afterEach`
- **Mock `axios`** for HTTP tests — never make real network calls in tests
- **Never mock the validator** — always validate with the real `validateManifest()` to catch regressions
- **Security tests** verify invariants: token permissions (0o600), no token leaking in output, input sanitization, HTTPS enforcement
- **Edge case tests** cover: concurrent token writes (race condition), large responses, filesystem permission errors

### When to add tests

| What you changed | Tests needed |
|-----------------|--------------|
| New service function | Unit test in `tests/unit/` |
| New CLI command | Integration test in `tests/integration/` |
| New manifest in `registry/` | Covered automatically by `security.test.ts` (validates all manifests) |
| Bug fix | Regression test that reproduces the bug |
| Security-sensitive code | Test in `security.test.ts` |

### Coverage

Coverage is generated with `npm test -- --coverage` (uses `@vitest/coverage-v8`). CI uploads the report as an artifact on every push. We don't enforce a threshold, but use it to spot untested branches.

## CI/CD

### What runs automatically

Every push to `main` and every PR triggers the CI pipeline (`.github/workflows/ci.yml`):

| Job | What it does |
|-----|-------------|
| **Lint & Typecheck** | `npm run lint` + `npm run typecheck` |
| **Test** | `npm test` on Node 20 and 22, with coverage |
| **Build** | `npm run build`, verifies `dist/index.js` exists |
| **Dependency Audit** | `npm audit --audit-level=high` |

All jobs must pass before merging to `main`.

### Smoke tests

After every npm publish or GitHub release, a smoke test (`.github/workflows/smoke.yml`) runs on Ubuntu and macOS:

1. Installs `@nico0891/stackrun` from npm
2. Runs `stackrun --help`, `search`, `install`, `schema`, `uninstall`
3. Verifies the published package actually works end-to-end

Can also be triggered manually from the Actions tab.

### Running CI checks locally

Before pushing, run the same checks CI will run:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run lint && npm run typecheck && npm test && npm run build` — all must pass
4. Add tests for new functionality (see "When to add tests" above)
5. Write a clear PR description: what changed, why, how to test
6. Keep PRs focused — one feature or fix per PR
7. CI must pass before merge

## Reporting Issues

Use [GitHub Issues](https://github.com/nico150891/stackrun/issues) with the appropriate template:
- **Bug Report** — something broken or unexpected
- **Feature Request** — new functionality or improvement
- **New Tool** — request or contribute a new SaaS manifest
