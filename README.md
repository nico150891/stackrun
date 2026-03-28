# Stackrun

Universal CLI to install, authenticate, and execute SaaS tools from terminal.

Built for developers and AI agents that need to interact with external APIs without wrappers or SDKs.

## How it works

Each SaaS tool is described by a declarative JSON manifest (URL, auth, endpoints). Stackrun handles the full flow: search tools in a registry, install them, store tokens, and execute HTTP calls.

```
stackrun search stripe                              # find tools in the registry
stackrun install stripe                             # download the manifest
stackrun login stripe                               # store your API key
stackrun call stripe list_customers --limit 10      # execute the API call
stackrun schema stripe                              # see available commands
stackrun uninstall stripe                           # remove the tool
stackrun logout stripe                              # remove stored token
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/nico150891/stackrun.git
cd stackrun
npm install

# Link for global usage during development
npm link

# Run in dev mode
npm run dev -- --help
```

## Development

```bash
npm run dev         # run with ts-node
npm run build       # compile to dist/
npm test            # run tests (vitest)
npm run lint        # eslint
npm run format      # prettier
npm run typecheck   # tsc --noEmit
```

## Project Structure

```
src/
├── commands/       # CLI commands (search, install, uninstall, login, logout, call, list, schema)
├── services/       # Business logic (registry, auth, executor, storage, validator)
├── types/          # TypeScript type definitions
└── index.ts        # Entry point

registry/           # Tool manifests (JSON) — the MVP registry
tests/              # Unit and integration tests
docs/               # Plans, decisions, notes
```

## Adding a New Tool

Create a JSON manifest in `registry/` following the schema:

```json
{
  "name": "tool-name",
  "version": "1.0.0",
  "description": "What it does",
  "base_url": "https://api.example.com/v1",
  "auth": { "type": "bearer", "header": "Authorization", "prefix": "Bearer" },
  "headers": { "X-Api-Version": "2024-01-01" },
  "commands": [
    {
      "name": "list_items",
      "method": "GET",
      "path": "/items",
      "description": "List all items",
      "params": [
        { "name": "limit", "description": "Max results", "required": false, "location": "query", "type": "number" }
      ]
    }
  ]
}
```

Then add it to `registry/index.json`.

## License

MIT
