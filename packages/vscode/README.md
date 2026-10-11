<div align="center">
  <br />
  <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/packages/vscode/media/icon.png" width="72" />

  <h1>Courier for VS Code</h1>

  <p><strong>Courier Studio in your editor.</strong></p>

  <p>Above each call to an endpoint, how its calls went in the Studio running for your project — how many, how many failed, how many are still in flight, and how long nineteen in twenty took. Every endpoint in a view of its own, with the code that calls it; the audit's findings where the code calls; Studio started in a click; and your API offered to VS Code's agent.</p>

  <p>
    <a href="https://code.visualstudio.com/"><img alt="VS Code 1.95 or later" src="https://img.shields.io/badge/vs%20code-1.95%2B-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/studio/editor"><strong>Documentation</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/studio">Courier Studio</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/vscode">Source</a>
  </p>

  <br />

  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/lens-dark.png" />
    <img alt="VS Code with a shop's checkout code open: above each call to an endpoint, a line saying how many calls it had in Courier Studio, how many failed and how long nineteen in twenty took" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/lens-light.png" width="880" />
  </picture>
  <br />
</div>

<br />

## Overview

You find out an endpoint is slow, or failing, where you are already looking: in the code that calls it. The extension reads the figures from Courier Studio, which watches every call your app makes, and writes them above each call to an endpoint as you work.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Figures where you work</h4>
      Calls, failures, calls in flight and the 95th percentile, above every call to an endpoint, kept up to date while the window has focus.
    </td>
    <td width="33%" valign="top">
      <h4>Every endpoint in one view</h4>
      Sources, groups and endpoints with how their calls went, a badge counting the failing ones, and each place your code calls them.
    </td>
    <td width="33%" valign="top">
      <h4>The audit at your calls</h4>
      An N+1 pattern, a timeout risk, a write retried without an idempotency key — marked where the code makes the call.
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <h4>One click to Studio</h4>
      The endpoint, its failed calls, or the latest failure in Studio's inspector; and Studio started for you when it does not run.
    </td>
    <td width="33%" valign="top">
      <h4>Your API for the agent</h4>
      VS Code's agent gets each project's MCP servers — its API and its Studio — with no <code>mcp.json</code> to write.
    </td>
    <td width="33%" valign="top">
      <h4>Stays on your machine</h4>
      It talks only to Studio on <code>localhost</code>, reads what any page of Studio's reads without its token, and stays off in Restricted Mode.
    </td>
  </tr>
</table>

<br />

## What you see

```ts
// orders.place · 34 calls · 1 failed · p95 210 ms
await api.orders.place({ sku, quantity })
```

Hover over the call for the rest: the median and the 95th percentile, the statuses the calls ended with, and the latest failure with its reason — **Open the latest failure** opens that request in Studio's inspector. A stream or a channel shows how many were opened, and how many are open.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/hover-dark.png" />
  <img alt="The hover over a call to orders.place: its calls and failures in Courier Studio, the median and the 95th percentile, the statuses the calls ended with, the latest failure — a 409 Conflict — and links that open the endpoint and the failed request in Studio" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/hover-light.png" width="880" />
</picture>

<br />

## The Courier view

The Courier icon in the Activity Bar opens every endpoint of your project — each source, the groups its calls name, each endpoint with its figures, failed, answered or not called yet — and under an endpoint, each place your code calls it. Its actions open the endpoint in Studio, its failed calls in the Timeline, or the latest failure in the inspector.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/view-dark.png" />
  <img alt="The Courier view beside the shop's checkout code: its sources, the groups of each with how many endpoints are failing, the orders group open — each endpoint with its calls, failures and p95 — and orders.place open at the line of the checkout that calls it" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/view-light.png" width="880" />
</picture>

With no Studio running, the view starts one — your project's own `studio` script through its package manager, or `npx @noverax/courier-studio` — in a terminal of its own. In a workspace without Courier, **Set Up Courier** runs Create Courier, which shows its plan and changes nothing until you agree.

<br />

## The audit at your calls

Studio's audit reads the requests it recorded; the extension marks its findings at the calls they concern, and in the Problems panel under **Courier audit**, each linking to Studio's Audit page. An audit error is a warning in the editor: the code compiles, its traffic needs a look.

<br />

## Your API, for VS Code's agent

| Server | Offered when the project has | What the agent gets |
| --- | --- | --- |
| **Courier API** | `@noverax/courier-mcp` | The endpoints marked `.agent()`, and those the `agents` policy in `courier.config` offers |
| **Courier Studio** | `@noverax/courier-studio` | The requests Studio recorded, its audit, its mocks and their scenarios |

Each runs from the project's folder, the API's handed the project's `.env` files, and starts only when the agent first needs it. VS Code 1.101 or later.

<br />

## How it works

Studio writes where it runs to `.courier/studio.json` in your project, and the extension reads it — for a monorepo, each project's own Studio, the one nearest the file you are in. Studio finds the calls in the file as it stands in the editor, saved or not, the same way it finds them for **Called from** in its inspector: a member chain that ends with an endpoint's name, `api.orders.place()`, and a query hook that names one, `q.orders.useQuery("list")`, in TypeScript, JavaScript, and the scripts of Vue, Svelte and Astro components.

The extension sends Studio the text of the files you open, so it talks only to a Studio on this machine: an address naming another host, in a project's file or in the settings, is ignored.

<br />

## Commands

- **Courier: Open in Courier Studio** — open Studio for the project of the file in front
- **Courier: Start Studio** — start Studio for the project of the file in front, or the one you pick
- **Courier: Set Up Courier** — run Create Courier in a terminal, in the workspace folder you pick
- **Courier: Refresh Endpoint Hints** — find the calls again and bring the figures up to date

From Studio the other way round: each call site in **Called from** opens in your editor; choose which in Studio's Settings → Editor.

<br />

## Settings

| Setting | What it does |
| --- | --- |
| `courier.hints.enabled` | Show the hints above endpoint calls (default: on) |
| `courier.hints.refreshSeconds` | How often the figures are brought up to date while the window has focus (default: 5) |
| `courier.audit.diagnostics` | Mark the audit's findings at the calls they concern (default: on) |
| `courier.agents.mcpServers` | Offer VS Code's agent each project's MCP servers (default: on) |
| `courier.studio.url` | Studio's address, when it runs for a project outside this workspace — on this machine, in your user settings |

<br />

## Snippets

`courier-endpoint`, `courier-group`, `courier-api` and `courier-boundary` define an API; `courier-query`, `courier-mutation`, `courier-subscription`, `courier-channel` and `courier-call` call it.

<br />

## Part of Courier

Courier is type-safe HTTP for any framework: define your API once in plain TypeScript and call it from server code, the browser and AI agents, every call visible in Studio. See [courier.noverax.cloud](https://courier.noverax.cloud).

<br />

## License

[MIT](https://github.com/NoveraX/courier/blob/master/LICENSE)

<br />

<div align="center">
  <sub>Part of <a href="https://github.com/NoveraX/courier">Courier</a> · built by <a href="https://github.com/NoveraX">NoveraX</a></sub>
</div>
