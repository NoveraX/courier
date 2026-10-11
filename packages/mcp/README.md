<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier MCP</h1>

  <p><strong>Your API, as tools for AI agents.</strong></p>

  <p>The definition your typed client is built from becomes an MCP server. Mark an endpoint <code>.agent()</code>, and Claude Code, Cursor, Codex or any MCP client can call it — with your schemas, through your middleware, watched in Studio.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-mcp"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-mcp?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/mcp"><strong>AI agents</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp">Source</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/mcp-dark.png" />
    <img alt="courier-mcp --list in a shop project: ten tools offered to agents, each with its access — read, write, or destructive with a person confirming — and the eight endpoints kept from agents, with why" src="https://raw.githubusercontent.com/NoveraX/courier/master/.github/assets/mcp-light.png" width="880" />
  </picture>
  <br />
</div>

<br />

## Overview

An endpoint becomes a tool with the description, schemas and access you give it, and nothing reaches an agent that you did not offer. Over stdio for your editor's agent, over Streamable HTTP from a route of your app, the same policy decides what each client sees.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Nothing you did not offer</h4>
      Only what you mark <code>.agent()</code>, unless the project's <code>agents</code> policy offers more; <code>deny</code> wins over everything.
    </td>
    <td width="33%" valign="top">
      <h4>A person confirms</h4>
      A destructive tool runs only once the person at the client confirms that exact call — every write too, if you ask.
    </td>
    <td width="33%" valign="top">
      <h4>One path</h4>
      Agents' calls run through the same middleware, schemas and Studio as your app's; <code>ctx.agent</code> says who asked.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Read-only in one flag</h4>
      <code>--read-only</code> and <code>--deny</code> narrow what the config offers, never widen it.
    </td>
    <td valign="top">
      <h4>What is offered, and why</h4>
      <code>--list</code>, Studio's Explorer and <code>courier-studio diff</code> show each tool and what offered it.
    </td>
    <td valign="top">
      <h4>Both eras of MCP</h4>
      The 2026-07-28 revision, and the <code>initialize</code> handshake clients still speak by default.
    </td>
  </tr>
</table>

<br />

## Mark an endpoint

```ts
endpoint
  .get("orders/:id")
  .variables(z.object({ id: z.string() }))
  .response(Order)
  .agent({ description: "One order by its id, with its status and total", access: "read" })
```

The tool takes its name from the endpoint, its input schema from the variables, and its description and access from the mark. An agent calls it as your app would: through the source's and the endpoint's middleware, with its schemas checked, and shown in Studio's Timeline.

<br />

## Install

```bash
npm install @noverax/courier-mcp
```

The command runs from your project's own install, so it loads your config with the same Courier your app runs; for the command alone, a dev dependency is enough.

<br />

## In your editor, over stdio

The command serves the `courier.config.*` of the project it is installed in. For Claude Code:

```bash
claude mcp add courier --scope project -- npx @noverax/courier-mcp --dotenv .env.local
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
| `--read-only` | Offer reads alone, whatever the config's `agents` allows |
| `--deny <patterns>` | Endpoints to keep from agents as well, comma-separated: `billing.**` |
| `--list` | Print what is offered to agents and why, and exit |
| `--no-watch` | Keep the tools the server started with |
| `--allow-destructive` | For a client that cannot ask a person, leave a call a person confirms to the client's own approval |
| `--timeout <ms>` | How long a call may take when its endpoint names no timeout (60 000) |
| `--name <name>` | The name the server gives its client (`courier`) |

`--read-only` and `--deny` only narrow what the config offers. A save to the config, or a module it reaches, loads it again — only what changed is transformed — and the client is told when the tools it sees change: `notifications/tools/list_changed` on the 2025 handshake, the `subscriptions/listen` stream under 2026-07-28. With Studio running, every call an agent makes shows in its timeline.

<br />

## What agents may call

```ts
// courier.config.ts
export default defineConfig({
  sources: { shop, billing },
  agents: { offer: "reads", deny: ["billing.**"], confirm: "write" },
})
```

`offer` — `"marked"` (default), `"reads"` or `"all"`; `allow` and `deny` — patterns of calls, `*` within a name, `**` across names; `access` — the most a tool may do; `confirm` — from which access a person confirms each call. An endpoint is decided by the first rule that speaks: `deny`, `.agent(false)`, `access`, `.agent()`, `allow`, `offer`.

<br />

## In your app, over HTTP

```ts
// app/mcp/route.ts
import { createMcpHandler } from "@noverax/courier-mcp"

import config from "../../courier.config"

const mcp = createMcpHandler({
  agents: config.agents,
  authorize: (request) => apiKeys.verify(request.headers.get("authorization")),
  allow: (tool, principal) => tool.access === "read" || principal.role === "admin",
})

export const POST = mcp.handle
export const GET = mcp.handle
export const OPTIONS = mcp.handle
```

`agents` is the project's policy — pass the config's, so the endpoint offers what the editor's server and Studio show. `authorize` is required: the tools run with your app's credentials. It returns whoever the caller is — middleware reads it as `ctx.agent.principal` — `null` for a 401, or a `Response` of its own for an OAuth challenge. A tool `allow` keeps from a principal is absent from its list and unknown to its calls.

<br />

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier"><strong>@noverax/create-courier</strong></a><br />
      All of it in your project, in one command.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/react"><strong>@noverax/courier-react</strong></a><br />
      React Query hooks typed from the same definition.
    </td>
  </tr>
</table>

<br />

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
