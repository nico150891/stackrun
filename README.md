# Stackrun

[![npm package](https://img.shields.io/npm/v/@nico0891/stackrun?color=brightgreen)](https://www.npmjs.com/package/@nico0891/stackrun)
[![node](https://img.shields.io/node/v/@nico0891/stackrun?color=blue)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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

## Install

```bash
npm install -g @nico0891/stackrun
```

Then run:

```bash
stackrun --help
```

## Quick Start

```bash
stackrun search stripe                              # find tools
stackrun install stripe                             # install manifest
stackrun login stripe --token sk_test_xxx           # store API key
stackrun call stripe list_customers --limit 5       # make the call
stackrun call stripe list_customers --json | jq .   # pipe JSON output
```

## Available Tools

| Tool | Description |
|------|-------------|
| stripe | Stripe payments API |
| github | GitHub REST API |
| notion | Notion workspace API |
| slack | Slack messaging API |
| hubspot | HubSpot CRM API |
| sendgrid | SendGrid email API |
| linear | Linear project management API |

Run `stackrun search` to see all available tools.

## Agent Mode

Stackrun is designed for AI agents. Use `--agent` or `--json` for machine-readable output:

```bash
stackrun search --agent                    # JSON, no spinners, no color
stackrun call stripe list_customers --json # clean JSON to stdout
stackrun schema stripe --json              # discover commands programmatically
```

Pipe detection is automatic: when stdout is not a TTY, output defaults to JSON.

## Development

```bash
# Clone the repo
git clone https://github.com/nico150891/stackrun.git
cd stackrun
npm install

# Scripts
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
