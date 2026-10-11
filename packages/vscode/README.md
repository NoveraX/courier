<div align="center">
  <br />
  <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/packages/vscode/media/icon.png" width="72" />

  <h1>Courier for VS Code</h1>

  <p><strong>Courier Studio in your editor.</strong></p>

  <p>Above each call to an endpoint, how its calls went in the Studio running for your project — how many, how many failed, how many are still in flight, and how long nineteen in twenty took. A click opens the call in Studio.</p>

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
      <h4>One click to Studio</h4>
      A click on the line opens the endpoint in Studio, with its calls; from Studio, each call site opens back in your editor.
    </td>
    <td width="33%" valign="top">
      <h4>Stays on your machine</h4>
      It talks only to Studio on <code>localhost</code>, and reads what any page of Studio's reads, without its token.
    </td>
  </tr>
</table>

<br />

## What you see

```ts
// orders.place · 34 calls · 1 failed · p95 210 ms
await api.orders.place({ sku, quantity })
```

Hover over the call for the rest: the median and the 95th percentile, the statuses the calls ended with, and the latest failure with its reason. A stream or a channel shows how many were opened, and how many are open.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/hover-dark.png" />
  <img alt="The hover over a call to orders.place: its calls and failures in Courier Studio, the median and the 95th percentile, the statuses the calls ended with, the latest failure — a 409 Conflict — and a link that opens the endpoint in Studio" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/images/vscode/hover-light.png" width="880" />
</picture>

<br />

## How it works

Start Courier Studio for your project, as you always do:

```bash
npx @noverax/courier-studio
```

Studio writes where it runs to `.courier/studio.json` in your project, and the extension reads it — for a monorepo, each project's own Studio, the one nearest the file you are in. Studio finds the calls in the file as it stands in the editor, saved or not, the same way it finds them for **Called from** in its inspector: a member chain that ends with an endpoint's name, `api.orders.place()`, and a query hook that names one, `q.orders.useQuery("list")`, in TypeScript, JavaScript, and the scripts of Vue, Svelte and Astro components.

<br />

## Settings

| Setting | What it does |
| --- | --- |
| `courier.hints.enabled` | Show the hints above endpoint calls (default: on) |
| `courier.hints.refreshSeconds` | How often the figures are brought up to date while the window has focus (default: 5) |
| `courier.studio.url` | Studio's address, when it runs for a project outside this workspace |

<br />

## Commands

- **Courier: Open in Courier Studio** — open Studio for the project of the file in front
- **Courier: Refresh Endpoint Hints** — find the calls again and bring the figures up to date

From Studio the other way round: each call site in **Called from** opens in your editor; choose which in Studio's Settings → Editor.

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
