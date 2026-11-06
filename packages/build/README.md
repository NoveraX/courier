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

  <p>The bundler plugin that hands every page — and every server rendering one — the routes its proxy client may call, read from <code>courier.config.ts</code> by the rules the proxy applies. The routes module carries no address, path or middleware, and no <code>courier.routes.ts</code> is written or committed. It is also the one loader of the config every Courier tool shares.</p>

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
      A build that cannot read the config fails with why, and a page that imports the config itself fails the build, as it would ship every API's definition to the browser.
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

- **The config** is the `courier.config.*` in Vite's root or the nearest folder above it, up to the top of the project: the folder that holds its repository (`.git`, `.hg`, `.jj`) or is the root of its workspace (`pnpm-workspace.yaml`, or a `package.json` with `workspaces`). One found above the root runs only when it belongs to you or to the owner of the root, and no user outside its group may write it; otherwise the routes are not read, and the error says why. Name another config with the `config` option.
- **Env files** are those Vite reads for the mode — `.env.[mode].local`, `.env.[mode]`, `.env.local`, `.env`, the first to set a variable winning — with the values Vite gives them, a reference such as `${HOST}` or `${FLAG:-1}` filled in; a variable the process was started with wins over all. An endpoint opened by a variable is opened as the build sees it. The config reads them from `process.env`: `import.meta.env.MODE`, `DEV` and the other values Vite builds into a page are not set for it.
- **A build** reads the routes once for every environment, and fails with what the config threw; a build that watches builds again once what failed it is mended. **The dev server** reads them again whenever something they came from changes: the config, a module it imports, a file it reads or a folder it lists, an env file, a variable it looked at, or a config saved where one is looked for, Vite's root or a folder above it. A change saved while the routes are read is read too. A config that breaks leaves the routes it read last in force, says why in the terminal and over the page, and is followed until it is mended.
- **The framework's own modules** are answered as its server answers them, by the framework the project's package.json lists: Next's `server-only` is an empty module and `client-only` is refused, SvelteKit's `$env/*` and `$app/environment` and Astro's `astro:env/*` come from the environment — see [How Courier reads your project](https://courier.noverax.cloud/docs/reading-your-project).
- **The config in a page** fails the build: imported as a value it would ship the server's settings and every API's definition to the browser. Import its type alone, with `import type`.
- **Vitest** runs tests through Vite with the plugin: a test gets the routes under Node and under jsdom alike, may import the config itself, and in watch mode an edit reruns the tests that import the routes, with the new ones. Vitest 3.1 and later tell the plugin they run it; under Vitest 3.0 a test that imports the config as a value in a browser environment is refused as a page would be.
- **Definitions in a page** are not refused: a module of definitions a page imports as a value goes to the browser whole, with each API's address, its paths and middleware, and its endpoints closed to pages. Keep them out of a page's modules, or import their types alone; the routes are all a page needs to call through the proxy.

### Options

| Option | Default | |
|---|---|---|
| `config` | the `courier.config.*` found from the root | The config file, from Vite's root or absolute |

<br />

## webpack, Rspack and Rsbuild

The same routes, under the webpack family: a plugin adds a rule that builds them in place of `@noverax/courier/routes`, in every bundle the compiler builds, and a rule that fails a page's bundle where it takes the config itself.

```ts
// webpack.config.ts
import { CourierRoutesPlugin } from "@noverax/courier-build/webpack"

export default { plugins: [new CourierRoutesPlugin()] }
```

Rspack runs the same plugin, from `@noverax/courier-build/rspack`. Rsbuild takes its own, which builds every environment — a page's and a server's:

```ts
// rsbuild.config.ts
import { courierRoutes } from "@noverax/courier-build/rsbuild"
import { defineConfig } from "@rsbuild/core"

export default defineConfig({ plugins: [courierRoutes()] })
```

Next.js takes `withCourier()` from `@noverax/courier-next/plugin`, under Turbopack and webpack alike; Nuxt's `courierRoutesModule` builds the routes under its webpack and Rspack builders as under Vite.

- **The config** is found from the compiler's context — Rsbuild's root — as Vite's plugin finds it from Vite's root, and the `config` option names another.
- **Variables** are the process's: the bundler's own env files, which Next.js and Rsbuild load before they build, reach the config, and webpack reads none of its own.
- **A watching build or a dev server** builds the routes module again when a file the config read changes or a path it looked for appears. Its result is never kept for the same inputs, as no bundler sees the variables a config reads; the engine reads the routes again only when what they came from has changed. A config that breaks under a dev server leaves the routes it read last in force and reports why with the compilation's errors; a build fails with it.

<br />

## esbuild

The same routes, under esbuild: the plugin from `@noverax/courier-build/esbuild` builds them in place of `@noverax/courier/routes`, and a bundle for any `platform` but `node` — a page's — fails where it takes the config itself. A page's bundle takes the core's modules for a page with `platform: "browser"`, esbuild's default; `"neutral"` sets no condition, and a page built so takes the core's server modules.

```ts
import { build } from "esbuild"
import { courierRoutes } from "@noverax/courier-build/esbuild"

await build({ entryPoints: ["src/main.ts"], bundle: true, outdir: "dist", plugins: [courierRoutes()] })
```

- **The config** is found from `absWorkingDir`, or the folder esbuild runs in, and the `config` option names another.
- **Variables** are the process's: esbuild reads no env file of its own.
- **A context that builds again**, under `watch()` or `serve()`, follows every file the routes came from, each path the config looked for that is not there yet, and each folder it listed. A config that breaks on a later build leaves the routes read last in force, with a warning; a first build fails with it.

<br />

## Rollup and Rolldown

Rollup and Rolldown take the same plugin, from `@noverax/courier-build/rollup`. Neither tells a page's bundle from a server's, so a bundle is taken for a page's, which fails where it takes the config itself; a server's, which may import it, says so. A page's bundle takes the core's modules for a page by the `browser` condition, which Rollup's `@rollup/plugin-node-resolve` sets with `nodeResolve({ browser: true })`:

```js
// rollup.config.js
import { courierRoutes } from "@noverax/courier-build/rollup"

export default [
  { input: "src/main.js", output: { dir: "dist" }, plugins: [courierRoutes()] },
  { input: "src/server.js", output: { dir: "server" }, plugins: [courierRoutes({ server: true })] },
]
```

- **The config** is found from the folder the bundler runs in, and the `config` option names another.
- **Under `watch`**, every file the routes came from is watched, each path the config looked for that is not there yet, and each folder it listed. A config that breaks on a rebuild leaves the routes read last in force, with a warning; a build fails with it.

<br />

## Metro and Expo

Metro bundles only files on disk, so `withCourier()` from `@noverax/courier-build/metro` reads the routes before Metro starts and writes them to a module of the app's own, `node_modules/.cache/@noverax/courier/routes.js`, which `@noverax/courier/routes` resolves to:

```js
// metro.config.js
const { getDefaultConfig } = require("expo/metro-config")
const { withCourier } = require("@noverax/courier-build/metro")

module.exports = withCourier(getDefaultConfig(__dirname))
```

- **The config** is found from Metro's `projectRoot`, and the `config` option names another.
- **A dev server** keeps the module current: a change to a file the routes came from — an edit saved by replacing the file, as editors save, too — reads them again, and Metro bundles the module anew. A config that breaks leaves the routes read last in force, and says why in Metro's terminal; with none read yet, the module fails where it is imported, saying why.
- **A build** — `expo export`, a release bundle — fails while the routes cannot be read, with why.
- **The config in the app's bundle** fails it: the app's bundle would carry the server's settings and every API's definition. A server's bundle under Expo — its API routes, React Server Components — may take it.
- **`outDir`** names another folder for the module, where `node_modules` cannot be written; one outside the project is added to `watchFolders`. The app's own `resolveRequest` runs for every other module, Expo's as well.

<br />

## Jest

Jest runs the transformer from `@noverax/courier-build/jest` on the module `@noverax/courier/routes` ships. Jest transforms nothing under `node_modules` unless told, and the core is an ES module it transforms in any case:

```js
// jest.config.js
export default {
  transform: {
    "/node_modules/@noverax/courier/lib/routes/index\\.js$": "@noverax/courier-build/jest",
    "\\.[jt]sx?$": "babel-jest",
  },
  transformIgnorePatterns: ["/node_modules/(?!@noverax/courier/)"],
}
```

- **The routes** are CommonJS for a test that requires them, and an ES module under `--experimental-vm-modules`.
- **The config** is found from Jest's `rootDir`, and read once in each worker while nothing it read changes; `["@noverax/courier-build/jest", { config: "…" }]` names another.
- **Jest's cache** is keyed by the routes themselves: a run after an edit, or under another value of a variable the config reads, never takes the routes of the last.
- **Under `--watch`**, a test that takes only the routes is not run again when a definition changes: Jest follows the module the package ships, which imports none. Run them all with `a`.

<br />

## API

| Export | From | Purpose |
|---|---|---|
| `courierRoutes(options?)` | `/vite` | The Vite plugin: the routes in place of `@noverax/courier/routes`, in every environment |
| `CourierRoutesPlugin` | `/webpack`, `/rspack` | The webpack and Rspack plugin: the routes in every bundle, and the config refused in a page's |
| `courierRoutes(options?)` | `/rsbuild` | The Rsbuild plugin, for every environment |
| `courierRoutes(options?)` | `/esbuild` | The esbuild plugin: the routes in every bundle, and the config refused in a page's — any `platform` but `node` |
| `writtenRoutesPlugin(options)` | `/esbuild` | The esbuild plugin for a host that follows only the files a build read from disk, as Angular's builders do: the routes written to a module there, kept current while the host watches |
| `courierRoutes(options?)` | `/rollup` | The Rollup and Rolldown plugin: the routes in every bundle, and the config refused unless `server: true` says the bundle is a server's |
| `withCourier(config, options?)` | `/metro` | Metro's and Expo's: the routes written to a module of the app's own, kept current under a dev server, and the config refused in the app's bundle |
| `createTransformer(options?)` | `/jest` | The Jest transformer: the routes as CommonJS or an ES module, as the test runs, cached by the routes themselves |
| `routesProject(root, options?)` / `routesRule(project)` / `configInPageRule(project)` / `routesLoaderFile()` | `/webpack` | The rules the plugins add, for a framework that writes its bundler's config itself |
| `createRoutesEngine(options)` | root | Read a project's routes in a process of their own, again only when a file or variable they came from changed — for a plugin of another bundler |
| `routesModuleCode(snapshot)` / `routesCommonJsCode(snapshot)` / `unreadRoutesModuleCode(message)` | root | The module a bundle takes in place of `@noverax/courier/routes` — as an ES module or as CommonJS — or one that fails with why |
| `configInPageMessage(configFile)` | root | Why a page's bundle that takes the config itself fails, and what to write instead, as every plugin says it — for a plugin of another bundler |
| `RoutesReadError` | root | Why the routes were not read — `CONFIG_NOT_FOUND`, `CONFIG_NOT_TRUSTED`, `CONFIG_NOT_LOADED`, `ROUTES_NOT_READ`, `CORE_NOT_FOUND` or `ROUTES_NOT_WRITTEN` — and, in `inputs`, what the reading had read, which may mend it |
| `loadCourierConfig(options?)` | `/config` | Find and load `courier.config.{ts,mts,cts,js,mjs,cjs}`, in that order of names |
| `loadCourierConfigFile(file, options?)` | `/config` | Load one config file, found by whatever means the caller chose |
| `findConfigFile(startDir)` / `findConfigFileAt(cwd)` / `CONFIG_BASENAMES` | `/config` | The config file in a directory or the nearest one above it up to the top of the project (one above only when it is yours: else `UntrustedConfigError`), in that directory alone, and the names it may have |
| `configCandidates(startDir)` | `/config` | Every path a config is looked for at from a directory, in order, up to the top of the project |
| `createConfigJiti(file, options?)` | `/config` | The loader the config is read with, for another of the project's files |
| `findTransformCacheDirectory(projectRoot)` | `/config` | Where transforms are kept across processes: `.cache/courier/transform` in the nearest `node_modules`, or `null` when there is no `node_modules`, the directory could hold files another user placed, or `COURIER_TRANSFORM_CACHE` is `0`, `false` or `off` |
| `createTransformCache(options?)` | `/config` | Reuse each module's transform while its bytes are unchanged, in memory and in that directory |
| `projectTransformCache(projectRoot)` | `/config` | The transforms kept in a project's `node_modules/.cache`, for a process that loads its modules once |
| `readPathAliases(projectRoot)` | `/config` | The tsconfig `paths` the loader resolves imports through |
| `projectFramework(folder)` / `detectFramework(listed)` / `FRAMEWORK_MARKERS` | `/config` | The framework a project is built with, told by the packages the nearest package.json lists |
| `profileOf(framework)` / `RefusedModuleError` | `/config` | How the framework's server answers the imports it answers itself, and the error for one it refuses where definitions run |
| `importProjectFile(file, options?)` / `ConfigLoadError` / `configLoadError(error, load)` | `/config` | Run one of the project's files with the project's loader, and why one did not load: its `code`, the `hint`, and `context.importChain` from the entry to the module that failed, no variable's value in any of them |
| `COURIER_PHASE` / `DEFINITIONS_PHASE` / `enterDefinitionsPhase(env?)` | `/config` | The variable a project's code reads to tell that Courier reads its definitions, its value then, and how a process says so before the project's code runs |
| `CONFIG_READ_LIMIT_MS` | `/config` | How long one reading of a config may take, 60 s, before `courier-cli routes` and the routes plugin give it up |
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
