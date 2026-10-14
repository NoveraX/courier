<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier CLI</h1>

  <p><strong>What a page may call, written from your marks and checked in CI.</strong></p>

  <p>The command line for a Courier project and its CI: it writes <code>courier.routes.ts</code>, the one list of endpoints a page's proxy client may call, from the endpoints you mark <code>.expose()</code> — the same bytes Studio writes while it runs — and fails a CI job when the file is out of date.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-cli"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-cli?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/proxy-mode/expose"><strong>Exposing endpoints</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/cli">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

The proxy serves only the endpoints you mark `.expose()`. A page's proxy client takes them from `courier.routes.ts` — data alone, with no URL, header or schema of the upstream — so the browser bundle never carries your API's definition. `courier-cli routes` writes that file without Studio: in a project that does not run Studio, in a script, in CI.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>The same bytes as Studio</h4>
      Studio writes the module as it runs; the CLI writes it with the same code, so neither finds the other's file to change.
    </td>
    <td width="33%" valign="top">
      <h4>Checked in CI</h4>
      <code>--check</code> writes nothing and exits 1 when the file is not what the marks give.
    </td>
    <td width="33%" valign="top">
      <h4>Never over your code</h4>
      It writes only over a file that opens with its own header, and leaves any other as it is.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Formatted as your code</h4>
      With the Biome, ESLint and Prettier your project installed, its own settings — and only when the bytes change.
    </td>
    <td valign="top">
      <h4>Your variables</h4>
      The <code>.env</code> files your dev server reads, before the config loads, or the ones <code>--dotenv</code> names.
    </td>
    <td valign="top">
      <h4>Light</h4>
      No Studio and no server: it loads <code>courier.config.ts</code> and writes one file.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install --save-dev @noverax/courier-cli
```

Installed in the project, the CLI writes what the project's own version of Courier writes, as the lockfile pins it. `@noverax/courier` is its peer.

<br />

## Usage

```bash
npx @noverax/courier-cli routes          # write courier.routes.ts from the marks
npx @noverax/courier-cli routes --check  # write nothing; exit 1 when it is out of date
```

The module goes where `studio.routes` in `courier.config.ts` says — `courier.routes.ts` beside the config unless it names another file — and holds, for each source, every endpoint a page may call and how the page reaches it:

```ts
// Written by Courier from courier.config.ts. Do not edit it:
// `courier-cli routes` writes it again from the endpoints marked .expose().

import type { CourierRoutes, RouteMap } from "@noverax/courier/define";

import type config from "./courier.config";

type Sources = (typeof config)["sources"];

const apiEndpoints = {
  "users.create": { type: "mutation" },
  "users.getById": { type: "query" },
} as const satisfies RouteMap<Sources["api"]>;

/** What a page's proxy client may call of `api`, and how it reaches each endpoint. */
export const apiRoutes: CourierRoutes<Sources["api"], typeof apiEndpoints> = {
  source: "api",
  endpoints: apiEndpoints,
};
```

It type-checks against the config it was written from: a path the API no longer defines fails the page's build, not a request.

### Options

| Option | Description |
|---|---|
| `--check` | Write nothing, and exit 1 when the module is not what `courier.config.ts` gives |
| `--out <path>` | The module to write, in the project, from where the command runs (default: `studio.routes`, or `courier.routes.ts`) |
| `--cwd <dir>` | The project's root (default: the working directory) |
| `--dotenv <files>` | The env files to read before the config, comma-separated (default: `.env.development.local`, `.env.local`, `.env.development` and `.env`, those there are) |

The command exits with status 1 when the module is out of date under `--check`, when the file there holds code Courier did not write, or when the config does not load — each with one line naming the problem. `courier-cli --help` lists the commands; `--version` prints the installed version.

<br />

## In CI

Check the module in the job that checks your code, after the install:

```yaml
- run: npx @noverax/courier-cli routes --check
```

The file is what a page may call, so review a change to it as you review a change to an endpoint's permissions — a `CODEOWNERS` entry gives it the owners of the API:

```
/courier.routes.ts @your-org/api-owners
```

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
      See every request your app makes, live — and the routes written as you save.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/server"><strong>@noverax/courier-server</strong></a><br />
      Your API's proxy, its streams and its channels — on a port of their own.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/create-courier"><strong>@noverax/create-courier</strong></a><br />
      All of it in your project, in one command.
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
