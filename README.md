# Stackrun

[![CI](https://github.com/nico150891/stackrun/actions/workflows/ci.yml/badge.svg)](https://github.com/nico150891/stackrun/actions/workflows/ci.yml)
[![npm package](https://img.shields.io/npm/v/@nico0891/stackrun?color=brightgreen)](https://www.npmjs.com/package/@nico0891/stackrun)
[![node](https://img.shields.io/node/v/@nico0891/stackrun?color=blue)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Universal CLI to install, authenticate, and execute SaaS tools from terminal.

Built for developers and AI agents that need to interact with external APIs without wrappers or SDKs.

![demo](demo.gif)

## How it works

Each SaaS tool is described by a declarative JSON manifest (URL, auth, endpoints). Stackrun handles the full flow: search tools in a registry, install them, store tokens, and execute HTTP calls.

```
stackrun search stripe                              # find tools in the registry
stackrun install stripe                             # download the manifest
stackrun login stripe --token sk_test_xxx           # store your API key
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
# Find and install a tool
stackrun search stripe
stackrun install stripe

# Authenticate
stackrun login stripe --token sk_test_xxx

# See what commands are available
stackrun schema stripe

# Make API calls
stackrun call stripe list_customers --limit 5
stackrun call stripe create_customer --email user@example.com --name "Jane Doe"
stackrun call stripe get_balance

# Pipe JSON output
stackrun call stripe list_customers --json | jq '.data[].email'
```

## Available Tools

| Tool | Description | Auth |
|------|-------------|------|
| stripe | Stripe payments API | API key |
| github | GitHub REST API | Bearer token |
| notion | Notion workspace API | Bearer token |
| slack | Slack messaging API | Bearer token |
| hubspot | HubSpot CRM API | Bearer token |
| sendgrid | SendGrid email API | Bearer token |
| linear | Linear project management API | API key |
| twilio | Twilio communications API (SMS, calls) | Basic auth |
| jira | Jira project management API | Basic auth |
| resend | Resend transactional email API | Bearer token |
| vercel | Vercel deployment platform API | Bearer token |
| cloudflare | Cloudflare DNS, Workers, and more | Bearer token |
| openai | OpenAI API (GPT, DALL-E, embeddings) | Bearer token |
| google | Google APIs (Gmail, Calendar, Drive) | OAuth2 |

Run `stackrun search` to see all available tools, or `stackrun schema <tool>` to see a tool's commands.

## Discovering Commands

Use `stackrun schema` to see what a tool can do before calling it:

```bash
$ stackrun schema stripe

stripe v1.0.0 — Stripe payments API
Base URL: https://api.stripe.com/v1
Auth: api_key

Commands:
  list_customers    List all customers
    --limit         Maximum number of customers to return (optional, query)

  create_customer   Create a new customer
    --email         Customer email address (required, body)
    --name          Customer full name (optional, body)

  get_balance       Retrieve the current account balance
```

Use `stackrun schema <tool> --json` for machine-readable output.

## Authentication

Most tools use API keys or bearer tokens:

```bash
stackrun login stripe --token sk_test_xxx          # API key
stackrun login github --token ghp_xxx              # Bearer token
```

### OAuth2 (Google, etc.)

Tools with OAuth2 auth require a client ID. You can provide it via flag or environment variable:

```bash
# Via flags
stackrun login google --client-id YOUR_CLIENT_ID --client-secret YOUR_SECRET

# Via environment variables
export STACKRUN_OAUTH_CLIENT_ID=your_client_id
export STACKRUN_OAUTH_CLIENT_SECRET=your_secret
stackrun login google
```

This opens a browser for authorization. After you approve, the token is stored locally and refreshed automatically when it expires.

> **Note:** OAuth2 tools require you to register your own app with the provider (e.g., Google Cloud Console) and obtain client credentials.

### Token storage

Tokens are stored in `~/.stackrun/tokens.json` with `0o600` permissions (owner read/write only). To remove a stored token:

```bash
stackrun logout stripe
```

## Agent Mode

Stackrun is designed for AI agents. Use `--agent` or `--json` for machine-readable output:

```bash
stackrun search --agent                    # JSON, no spinners, no color
stackrun call stripe list_customers --json # clean JSON to stdout
stackrun schema stripe --json              # discover commands programmatically
```

Pipe detection is automatic: when stdout is not a TTY, output defaults to JSON.

## MCP Server

Stackrun works as an [MCP](https://modelcontextprotocol.io) server. One Stackrun MCP server replaces N individual API servers — every installed tool becomes native tool calls for your AI agent.

```bash
stackrun mcp              # start the MCP server (stdio)
stackrun mcp --list       # preview which tools would be exposed
```

Each manifest command is exposed as `<tool>_<command>` (e.g., `stripe_list_customers`, `github_get_user`).

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "stackrun": {
      "command": "stackrun",
      "args": ["mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add stackrun -- stackrun mcp
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "stackrun": {
      "command": "stackrun",
      "args": ["mcp"]
    }
  }
}
```

Then install tools and authenticate — the agent can call them immediately:

```bash
stackrun install stripe && stackrun login stripe --token sk_test_xxx
# Now your agent can use stripe_list_customers, stripe_create_customer, etc.
```

## Troubleshooting

### `Error: tool "X" is not installed`

```bash
stackrun install X
```

### `Error: no token found for "X"`

```bash
stackrun login X --token YOUR_TOKEN
```

### `Authentication failed` (401)

Your token is invalid or expired. Re-authenticate:

```bash
stackrun logout X
stackrun login X --token NEW_TOKEN
```

### `Could not reach registry`

Check your internet connection. The registry is hosted on GitHub — if `raw.githubusercontent.com` is blocked, set a custom registry URL:

```bash
export STACKRUN_REGISTRY_URL=https://your-mirror.com/registry
```

### OAuth2: `No client_id found`

OAuth2 tools (like Google) require client credentials:

```bash
stackrun login google --client-id YOUR_ID --client-secret YOUR_SECRET
# Or use env vars: STACKRUN_OAUTH_CLIENT_ID, STACKRUN_OAUTH_CLIENT_SECRET
```

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
├── commands/       # CLI commands (search, install, uninstall, login, logout, call, list, schema, mcp)
├── mcp/            # MCP server and tool call handler
├── services/       # Business logic (registry, auth, executor, storage, validator, oauth)
├── types/          # TypeScript type definitions
└── index.ts        # Entry point

registry/           # Tool manifests (JSON) — the MVP registry
tests/              # Unit and integration tests
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

Then add it to `registry/index.json`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## License

MIT
