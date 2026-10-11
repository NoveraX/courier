<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier Studio Core</h1>

  <p><strong>The runtime that connects your app to Courier Studio.</strong></p>

  <p><code>attachRuntime()</code> registers your config's sources and, in development, streams every call your server and browser make — requests, answers, cache hits, validation, streams — to Studio. In production it registers the sources, and nothing else.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-studio-core"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-studio-core?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/studio/overview"><strong>Studio overview</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/studio-core">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

This package connects a running Courier application to Courier Studio: one call at startup on the server, and the build plugins on the browser side. It never keeps a process alive on its own, and its Socket.IO client is loaded only outside production.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One call</h4>
      <code>attachRuntime()</code> at startup — from <code>instrumentation.ts</code>, a Nitro plugin, <code>hooks.server.ts</code> or before <code>listen()</code>.
    </td>
    <td width="33%" valign="top">
      <h4>Kept in step</h4>
      Outside production, the registered sources follow your edits as your dev server reloads.
    </td>
    <td width="33%" valign="top">
      <h4>Safe in production</h4>
      It registers the config's sources and connects to nothing; a browser bundle gets no config loader.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install @noverax/courier-studio-core
npm install --save-dev @noverax/courier-studio
```

Install it as a dependency, not a dev dependency, whenever your own code imports it — every server instrumentation snippet does. A production install leaves dev dependencies out, and a server that imports this package then stops at `Cannot find package '@noverax/courier-studio-core'`, even when it calls `attachRuntime()` only in development; and `attachRuntime()` runs in production too, where it registers the config's sources. The build plugins of `@noverax/courier-studio` reach it through their own dependency, so an app that only uses a build plugin does not need it listed.

The Socket.IO client that streams to Studio comes with it. It is loaded only outside production, and it never keeps a process alive on its own: a script or a test run that attaches exits when its work is done, whether Studio is running or not.

<br />

## Usage

### Attach a server runtime

```ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

await attachRuntime()
```

`attachRuntime()` reads `courier.config.ts` from disk (walking up from `process.cwd()`), registers its sources, and — outside production — connects to Studio. It dials the address the config's `studio` block names, so `studio: { port: 6290 }` moves the Studio server and every runtime together. `COURIER_STUDIO_URL` overrides both.

Outside production it keeps the registered sources in step with your edits: whenever a module your dev server reloads runs `defineApi()`, the config is read again and its sources registered anew. Only the sources the config declares are ever registered, as the config composes them.

It reads the config in production too, so the config must not import development tools. That is why Studio's mock servers are declared in `courier.mocks.ts` beside it: only Studio reads that file, and `attachRuntime()` never does.

### Attach a browser runtime

The Studio build plugins do this for you. By hand:

```ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

attachRuntime("browser")
```

Browser bundlers pick a build of `./runtime` without the config loader (the `browser` export condition), so importing it never pulls a TypeScript loader or Node built-ins into a client bundle. A browser sees neither `courier.config.ts` nor your environment: for a non-default Studio address, set `globalThis[Symbol.for("courier.studio.url")]` before attaching, or inline `COURIER_STUDIO_URL` with your bundler.

<br />

## API

| Export | From | Purpose |
|---|---|---|
| `attachRuntime(id?)` | `/runtime` | Connect a server or browser runtime; idempotent per id |
| `announceHosting(input)` | `/runtime` | Tell Studio which transports this runtime serves |
| `trackWSStream()` / `untrackWSStream()` | `/runtime` | Report WebSocket subscriptions to Studio |
| `loadCourierConfig(options?)` | `/config` | Find and load `courier.config.{ts,mts,cts,js,mjs,cjs}`, in that order of names |
| `loadCourierMocksFile(file, options?)` | `/config` | Load a `courier.mocks.*` file with the config's loader, as a mock's worker does |
| `findMocksFile(projectRoot)` | `/config` | The first of `MOCKS_BASENAMES` — `courier.mocks.{ts,mts,cts,js,mjs,cjs}` — in the project root |
| `findTransformCacheDirectory(projectRoot)` | `/config` | Where transforms are kept across processes: `.cache/courier/transform` in the nearest `node_modules`, or `null` when there is no `node_modules`, the directory could hold files another user placed, or `COURIER_TRANSFORM_CACHE` is `0`, `false` or `off` |
| `createTransformCache(options?)` | `/config` | Reuse each module's transform while its bytes are unchanged, in memory and in that directory |
| `readPathAliases(projectRoot)` | `/config` | The tsconfig `paths` the loader resolves imports through |
| `EventBus` | root | In-process Studio telemetry bus |
| `extractSourceMap(sources)` | root | Endpoint metadata for the Studio UI |
| `isSafeHttpOrigin(value)` | root | Whether a value is a plain HTTP(S) origin |

The app origin registry (`setAppOrigin`, `getAppOrigin`, `detectAppOrigin`) lives in `@noverax/courier`.

<br />

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/mcp"><strong>@noverax/courier-mcp</strong></a><br />
      Your API, as tools for AI agents.
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
