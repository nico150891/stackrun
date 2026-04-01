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

## Writing Tests

- Use **vitest** with the `describe`/`it`/`expect` pattern
- Mock `homedir()` from `node:os` for storage tests (use a tmpdir)
- Mock `axios` for HTTP tests — never make real network calls
- Place unit tests in `tests/unit/`, integration tests in `tests/integration/`

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run typecheck && npm test && npm run lint` — all must pass
4. Write a clear PR description: what changed, why, how to test
5. Keep PRs focused — one feature or fix per PR

## Reporting Issues

Use [GitHub Issues](https://github.com/nico150891/stackrun/issues) with the appropriate template:
- **Bug Report** — something broken or unexpected
- **Feature Request** — new functionality or improvement
- **New Tool** — request or contribute a new SaaS manifest
