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

Where a bundler builds the pages, Courier's plugin for it gives them the routes from `@noverax/courier/routes`, with no file at all: `courier-cli setup` moves a project there.

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

The command exits with status 1 when the module is out of date under `--check`, when the file there holds code Courier did not write, or when the config does not load — each with one line naming the problem. For a config that does not load, the line names the module that failed and the chain of imports from the config to it, and a second says what to do:

```text
ERROR courier:routes  src/server/db.ts imports "client-only": it is the marker of code for the browser, which Next.js refuses on the server, where courier.config is read (courier.config.ts → src/api.ts → src/server/db.ts).
 INFO courier:routes  Import that code from a client component alone, out of the modules courier.config imports.
```

A config still loading after 60 s — a module that waits for a connection as it is imported — is given up, and the command ends. The project's own message is quoted with the values of its environment masked — each as it is, escaped in JSON, encoded for an address, trimmed and line by line, every such form of 8 characters or more, the system's own variables left alone — and every credential in it cut, a bearer token or a password in an address, each as `[redacted]`. A value the code changed some other way is not found. `COURIER_LOG_LEVEL=debug` adds what the project's code threw, its stack masked the same way. `courier-cli --help` lists the commands; `--version` prints the installed version.

<br />

## Setup: the routes from Courier's plugin

```bash
npx @noverax/courier-cli setup --dry-run  # show what it changes
npx @noverax/courier-cli setup            # make the changes, once you say yes
```

In a Next.js, Nuxt, SvelteKit, Astro, React Router, Remix or SolidStart app Courier is set up in, it moves the pages from `courier.routes.ts` to the routes Courier's plugin builds in:

- the plugin in the build's config: `withCourier()` around `next.config`, Courier's module in `nuxt.config`, its integration in `astro.config`, its plugin in `vite.config`;
- each module that imports `courier.routes.ts` reads `routes.<source>` from `@noverax/courier/routes` instead, and registers the config there, so the routes are typed from it;
- `studio.routes` set to `false` in `courier.config.ts`, so Studio writes the file no more;
- `@noverax/courier-build` installed: a dev dependency, or a dependency in a Next.js app, whose `next start` loads its config.

Where a file is not in a shape it knows, it shows the lines to add instead. It deletes nothing: once the pages run on the plugin, `courier.routes.ts` and the `routes` script that writes it are yours to remove. These are the changes `create-courier` makes in a new project, so a project set up either way ends the same.

In a terminal it asks too whether to point your editor's agent at the docs of the Courier you install, where that would change anything: `@noverax/courier-docs` installed, and Courier's block written into `AGENTS.md`, as `create-courier --agents-md` writes it — see [Create Courier](https://courier.noverax.cloud/docs/create-courier#docs-for-your-editors-agent). `--agents-md` says yes without asking; with `--yes`, or without a terminal, no block is written unless it is passed. For a framework Courier has no plugin for, the docs are all it sets up.

| Option | Description |
|---|---|
| `--dry-run` | Show the plan, and change nothing |
| `--yes`, `-y` | Make the changes without asking |
| `--allow-dirty` | Make them with `--yes` where git has changes not committed, which it otherwise refuses |
| `--agents-md` | Point your editor's agent at the docs of the Courier you install: Courier's block in `AGENTS.md`, and `@noverax/courier-docs`; `--no-agents-md` leaves them out without asking |
| `--no-install` | Make the changes, and name the install command |
| `--json` | Report the plan and what was done as one JSON document on standard output, asking nothing; the document is the one `create-courier --json` writes |
| `--framework <name>` | `next`, `nuxt`, `sveltekit`, `astro`, `react-router`, `remix` or `solid-start` (default: found in `package.json`) |
| `--package-manager <name>` | `npm`, `pnpm`, `yarn` or `bun` (default: the project's) |
| `--cwd <dir>` | The project's root (default: the working directory) |

<br />

## Upgrade: a new release of Courier

```bash
npx @noverax/courier-cli@latest upgrade --dry-run  # show what it changes
npx @noverax/courier-cli@latest upgrade            # make the changes, once you say yes
```

In a project, or in a workspace from any of its packages, it moves every one of Courier's packages to a new release at once:

- each range raised where each manifest writes it, in the same kind of range: `^0.4.0` to `^0.5.0`, `0.4.0` to `0.5.0`, `~0.4` to `~0.5`. A range of another kind is left as written, and the plan says why;
- the breaking changes of each release it crosses, each with where its notes say what to write instead;
- your code carried over the releases it crosses, file by file, the script blocks of Vue, Svelte and Astro components among them;
- Courier's block in `AGENTS.md` brought up to date between its markers, in the file of the workspace's root and of each package that lists Courier, where the file holds the block: one without it is left alone. Where no manifest lists `@noverax/courier-docs`, the plan names `courier-cli setup --agents-md`, which installs the docs and writes the block;
- one install at the workspace's root, with your package manager. When it fails, the manifests, the lockfile and your code are put back as they were;
- then the types of what it changed are checked.

What it changes in your code is what the code says for certain, through the names it imports from Courier's packages:

| Release | Changed for you |
|---|---|
| 0.4.0 | `@noverax/courier-studio-core/config` imported from `@noverax/courier-build/config`, its mocks loader from `@noverax/courier-studio-core/mocks`, and `@noverax/courier-build` added beside Studio's runtime |
| 0.5.0 | the realtime errors imported from `@noverax/courier/realtime`, 0.4's realtime `TimeoutError` as `RealtimeTimeoutError`, `SSESubscription` as `Subscription`; `sendAuthRequired(connections, id, ms)` as `await connections.requireAuth(id, { timeoutMs: ms })` in an async function; `retryOn: [0, …]` as `["network", "timeout", …]`; `isHTTPError(error) && error.status === 0` as `isNetworkError(error) \|\| isTimeoutError(error)`; `.via(closure).reads()` as `.via(closure)` where the closure calls reading verbs alone, and `.writes()` after one that calls both kinds and names none; `"PROXY_VARIABLE_NOT_SERIALIZABLE"` as `"VARIABLE_NOT_ENCODABLE"` |

A renamed name is renamed at every reference only where the file binds it once and nothing takes the new name; otherwise it is imported under its old name, with `as`. A name your module exports keeps the name it exports. Where the meaning depends on your code — a body's own `code` may be `"TIMEOUT"`, an upstream may answer 499, a registry's call may be on another object — the plan lists it under **Left to you**, at its line, with what to write instead: `cancelPrevious` given as a list, `data.code`, status 499, `new HTTPError({ status: 0 })`, a platform's `AbortError`, `onError` typed with `HTTPError`, a `retryOn` function, 0.4's `connections` and `sseConnections` calls, the client's `ws.heartbeat` and `ws.maxMessageSize`, a pub/sub adapter of your own, an `allowedHosts` entry with a scheme, a `.via()` endpoint that names no kind and reads now, a closure typed `HttpProbe<Variables>`, a key named `PROXY_VARIABLE_NOT_SERIALIZABLE`, a URL import's `pinHash`, and an import's `from` with a user, a password or a secret parameter in its address, shown without them. A change that would not parse is left out, and the file named. A file Studio wrote is left to Studio: **Regenerate files**, in the import's **Manage**, writes it as the new release's Studio does.

Run it with `@latest`: it knows the changes up to its own release, and refuses a newer one. It also refuses a release that does not publish one of your packages, or that needs a newer Node.js than the one running. It asks the registry through your package manager, so your registry, proxy and credentials hold.

| Option | Description |
|---|---|
| `--dry-run` | Show the plan, and change nothing |
| `--yes`, `-y` | Upgrade without asking |
| `--allow-dirty` | Upgrade with `--yes` where git has changes not committed, which it otherwise refuses |
| `--to <version>` | The release to move to (default: the registry's latest) |
| `--from <version>` | Read the project as on this release, where its packages were moved by hand (default: the oldest installed) |
| `--no-install` | Make the changes, and name the install command |
| `--package-manager <name>` | `npm`, `pnpm`, `yarn` or `bun` (default: the project's) |
| `--cwd <dir>` | The project, or a package of its workspace (default: the working directory) |
| `--json` | Report the plan and what was done as one JSON document on standard output, asking nothing |

<br />

## In CI

Check the module in the job that checks your code, after the install:

```yaml
- run: npx @noverax/courier-cli routes --check
```

The command runs `courier.config.ts` and every module it imports, as your server would. While it does, `COURIER_PHASE` is `definitions`, so a module that checks the environment as it is imported can skip the check — `skipValidation: process.env.COURIER_PHASE === "definitions"` with `@t3-oss/env` — and the variables the definitions read, such as an API's `baseURL`, can come from an env file of their own: `--dotenv .env.ci`. See [How Courier reads your project](https://courier.noverax.cloud/docs/reading-your-project#in-ci).

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
