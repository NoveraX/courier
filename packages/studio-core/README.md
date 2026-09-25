<div align="center">
  <br />

  # @noverax/courier-studio-core

  **Instrumentation core for Courier Studio — `attachRuntime`, EventBus, event types, and Socket.IO connector.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-studio-core"><img src="https://img.shields.io/npm/v/@noverax/courier-studio-core?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Overview

This package connects a running Courier application to Courier Studio and streams what it does — requests, responses, cache hits, validation, streams — to the Studio UI over Socket.IO.

<br />

## Install

```bash
npm install --save-dev @noverax/courier-studio @noverax/courier-studio-core
```

Install it next to `@noverax/courier-studio` whenever your own code imports it — every server instrumentation snippet does. The build plugins of `@noverax/courier-studio` reach it through their own dependency, so an app that only uses a build plugin does not need it listed.

The Socket.IO client that streams to Studio comes with it. It is loaded only outside production, and it never keeps a process alive on its own: a script or a test run that attaches exits when its work is done, whether Studio is running or not.

<br />

## Usage

### Attach a server runtime

```ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

await attachRuntime()
```

`attachRuntime()` reads `courier.config.ts` from disk (walking up from `process.cwd()`), registers its sources, and — outside production — connects to Studio. It dials the address the config's `studio` block names, so `studio: { port: 7000 }` moves the Studio server and every runtime together. `COURIER_STUDIO_URL` overrides both.

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

## License

[MIT](../../LICENSE)
