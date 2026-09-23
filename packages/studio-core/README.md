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

This package instruments your Courier application and streams events (requests, responses, cache hits, validation, etc.) to the Studio UI over Socket.IO. It is automatically integrated by the Studio build plugins — you typically do not install it manually.

<br />

## Install

```bash
npm install @noverax/courier-studio-core @noverax/courier
```

The Socket.IO client that streams to Studio comes with it. It is imported only outside production, and it never keeps a process alive on its own: a script or a test run that attaches exits when its work is done, whether Studio is running or not.

<br />

## Usage

### Attach a runtime (server-side)

```ts
import { attachRuntime } from "@noverax/courier-studio-core/runtime"

await attachRuntime()
// Auto-loads courier.config.ts, registers sources, opens /runtime socket
```

`attachRuntime()` reads `courier.config.ts` from disk (walking up from `process.cwd()`), populates the core sources registry, and opens a `/runtime` Socket.IO connection to Studio in dev.

### Attach a runtime (browser build-plugin injected)

```ts
globalThis[Symbol.for("courier.studio.url")] = "http://127.0.0.1:6280"
await attachRuntime("next-browser")
```

<br />

## API

### `attachRuntime(id?)` — Single entry point for server + browser runtimes
### `loadCourierConfig()` — Walk-up + c12 config loader
### `announceHosting(input)` — Announce transport capabilities to Studio
### `setAppOrigin(origin)` / `getAppOrigin()` / `detectAppOrigin()` — App origin registry
### `EventBus` — In-process Studio telemetry bus
### `extractSourceMap(sources)` — Extract endpoint metadata for the Studio UI

<br />

## License

[MIT](../../LICENSE)
