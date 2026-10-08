<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="40" />
    </picture>
  </a>

  <h1>@noverax/courier-mcp</h1>

  <p><strong>Your API, as tools for AI agents — through the same middleware as your app.</strong></p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-mcp"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-mcp?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/agents/mcp"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The definition your typed client is built from becomes an MCP server. Mark an endpoint `.agent()` and Claude Code, Cursor, Codex or any MCP client can call it — with the schemas your endpoint already has, through the middleware your app already runs, visible in Studio like every other call.

```ts
endpoint
  .get("orders/:id")
  .variables(z.object({ id: z.string() }))
  .response(Order)
  .agent({ description: "One order by its id, with its status and total", access: "read" })
```

- **Only what you mark.** An endpoint without `.agent()` is out of every agent's reach.
- **One path for people and agents.** A tool's call runs through the source's and the endpoint's middleware, its schemas and Studio; `ctx.agent` tells a middleware who asked.
- **A person confirms what cannot be undone.** A `destructive` tool runs only once the person at the client has confirmed that exact call.
- **Both eras of MCP.** The 2026-07-28 revision, and the `initialize` handshake clients still speak by default.

<br />

## Install

```bash
npm install @noverax/courier-mcp @noverax/courier
```

<br />

## In your editor, over stdio

The command serves the `courier.config.*` of the project it is started in. For Claude Code:

```bash
claude mcp add courier -- npx @noverax/courier-mcp --dotenv .env.local
```

For Cursor, in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "courier": { "command": "npx", "args": ["@noverax/courier-mcp", "--dotenv", ".env.local"] }
  }
}
```

| Option | What it does |
| --- | --- |
| `--cwd <dir>` | The project root, where `courier.config.*` is |
| `--source <names>` | The sources to offer, comma-separated; every one by default |
| `--dotenv <files>` | `.env` files to load first, comma-separated |
| `--allow-destructive` | Run destructive tools without asking when the client cannot ask a person |
| `--timeout <ms>` | How long a call may take when its endpoint names no timeout (60 000) |
| `--name <name>` | The name the server gives its client (`courier`) |

With Studio running, every call an agent makes shows in its timeline.

<br />

## In your app, over HTTP

```ts
// app/mcp/route.ts
import { createMcpHandler } from "@noverax/courier-mcp"

const mcp = createMcpHandler({
  authorize: (request) => apiKeys.verify(request.headers.get("authorization")),
  allow: (tool, principal) => tool.access === "read" || principal.role === "admin",
})

export const POST = mcp.handle
export const GET = mcp.handle
export const OPTIONS = mcp.handle
```

`authorize` is required: the tools run with your app's credentials. It returns whoever the caller is — middleware reads it as `ctx.agent.principal` — `null` for a 401, or a `Response` of its own for an OAuth challenge. A tool `allow` keeps from a principal is absent from its list and unknown to its calls.

<br />

## License

MIT
