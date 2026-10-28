<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier Build</h1>

  <p><strong>A page's routes, built from your config. No file to generate.</strong></p>

  <p>The bundler plugin that hands every page — and every server rendering one — the routes its proxy client may call, read from <code>courier.config.ts</code> by the rules the proxy applies. Nothing else of the config reaches a bundle, and no <code>courier.routes.ts</code> is written or committed. It is also the one loader of the config every Courier tool shares.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-build"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-build?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
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
    <a href="https://github.com/NoveraX/courier/tree/master/packages/build">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Read from your marks</h4>
      Each endpoint you mark <code>.expose()</code>, by the rules the proxy applies — read from the config in a process of its own, so a build sees your files as they are.
    </td>
    <td width="33%" valign="top">
      <h4>Live as you work</h4>
      Edit a definition and the dev server serves the new routes without a restart; Vitest reruns the tests that import them.
    </td>
    <td width="33%" valign="top">
      <h4>Closed by default</h4>
      A build that cannot read the config fails with why, and a page that imports the config itself fails the build: the browser gets the routes and nothing else.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install --save-dev @noverax/courier-build
```

<br />

## Usage

Add the plugin to the app's Vite config:

```ts
// vite.config.ts
import { courierRoutes } from "@noverax/courier-build/vite"
import { defineConfig } from "vite"

export default defineConfig({ plugins: [courierRoutes()] })
```

Register the config once, in a module of the project, so `routes` is typed from it — a `courier-env.d.ts` beside the config keeps it out of every bundle:

```ts
// courier-env.d.ts
import type config from "./courier.config"

declare module "@noverax/courier/routes" {
  interface Register {
    config: typeof config
  }
}
```

A page then takes the routes of the API it calls, and its client reaches exactly the endpoints that API opens to a page:

```ts
import { createProxyCaller } from "@noverax/courier"
import { routes } from "@noverax/courier/routes"

export const shop = createProxyCaller(routes.shop)
```

`routes` holds every source of the config; one that opens nothing to a page has no endpoints. Without the plugin, reading a route throws `ConfigurationError` `ROUTES_NOT_BUILT`, so a page never runs on routes nobody built.

### How the routes are read

- **The config** is the `courier.config.*` in Vite's root or the nearest folder above it; name another with the `config` option.
- **Env files** are those Vite reads for the mode — `.env.[mode].local`, `.env.[mode]`, `.env.local`, `.env`, the first to set a variable winning — and a variable the process was started with wins over all. An endpoint opened by a variable is opened as the build sees it.
- **A build** reads the routes once for every environment, and fails with what the config threw. **The dev server** reads them again whenever a file they came from changes; a config that breaks leaves the routes it read last in force, and says why in the terminal and over the page.
- **The config in a page** fails the build: imported as a value it would ship the server's settings and every API's definition to the browser. Import its type alone, with `import type`.

### Options

| Option | Default | |
|---|---|---|
| `config` | the `courier.config.*` found from the root | The config file, from Vite's root or absolute |

<br />

## API

| Export | From | Purpose |
|---|---|---|
| `courierRoutes(options?)` | `/vite` | The Vite plugin: the routes in place of `@noverax/courier/routes`, in every environment |
| `createRoutesEngine(options)` | root | Read a project's routes in a process of their own, again only when a file or variable they came from changed — for a plugin of another bundler |
| `routesModuleCode(snapshot)` / `unreadRoutesModuleCode(message)` | root | The module a bundle takes in place of `@noverax/courier/routes`, or one that fails with why |
| `RoutesReadError` | root | Why the routes were not read: `CONFIG_NOT_FOUND`, `CONFIG_NOT_LOADED` or `ROUTES_NOT_READ` |
| `loadCourierConfig(options?)` | `/config` | Find and load `courier.config.{ts,mts,cts,js,mjs,cjs}`, in that order of names |
| `loadCourierConfigFile(file, options?)` | `/config` | Load one config file, found by whatever means the caller chose |
| `findConfigFile(startDir)` / `findConfigFileAt(cwd)` / `CONFIG_BASENAMES` | `/config` | The config file in a directory or the nearest one above it, in that directory alone, and the names it may have |
| `createConfigJiti(file, options?)` | `/config` | The loader the config is read with, for another of the project's files |
| `findTransformCacheDirectory(projectRoot)` | `/config` | Where transforms are kept across processes: `.cache/courier/transform` in the nearest `node_modules`, or `null` when there is no `node_modules`, the directory could hold files another user placed, or `COURIER_TRANSFORM_CACHE` is `0`, `false` or `off` |
| `createTransformCache(options?)` | `/config` | Reuse each module's transform while its bytes are unchanged, in memory and in that directory |
| `projectTransformCache(projectRoot)` | `/config` | The transforms kept in a project's `node_modules/.cache`, for a process that loads its modules once |
| `readPathAliases(projectRoot)` | `/config` | The tsconfig `paths` the loader resolves imports through |
| `unknownConfigKeys(config)` | `/config` | The keys of a config Courier does not read, which are usually typos |

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
      <a href="https://github.com/NoveraX/courier/tree/master/packages/cli"><strong>@noverax/courier-cli</strong></a><br />
      What a page may call, written from your marks and checked in CI.
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
