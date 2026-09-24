<div align="center">
  <br />

  # @noverax/courier-server

  **Standalone HTTP + WebSocket server for Courier.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-server"><img src="https://img.shields.io/npm/v/@noverax/courier-server?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Overview

A zero-config standalone server that handles HTTP (GET/POST), SSE streams, and WebSocket upgrades. Includes CORS, health checks, and graceful shutdown out of the box.

<br />

## Install

```bash
npm install @noverax/courier-server @noverax/courier ws
```

<br />

## Usage

### Programmatic

```ts
import { createCourierServer } from "@noverax/courier-server"
import { sources } from "./api"

const server = createCourierServer({
  sources,
  port: 3001,
  host: "localhost",
  allowedOrigins: ["http://localhost:3000"],
  onReady: (url) => console.log(`Server ready at ${url}`),
})

// server.url → "http://localhost:3001"
// server.sseConnections → active SSE connection registry
// server.wsConnections → active WS connection registry
// await server.stop() → graceful shutdown
```

### CLI

```bash
npx courier-server
npx courier-server --config ./deploy/courier.config.ts --port 3001 --allowed-origins https://app.example.com
```

Without `--config` it serves the `courier.config.*` in the working directory; a `--config` path is relative to it. TypeScript configs load as they are, extensionless imports and tsconfig path aliases included. The config needs `sources`, and its `server` block supplies what the flags leave out:

```ts
// courier.config.ts
import { defineConfig } from "@noverax/courier/config"
import { api } from "./src/api"

export default defineConfig({
  sources: { api },
  server: { port: 3001, allowedOrigins: ["https://app.example.com"] },
})
```

The command exits with status 1 when the server cannot start — the port is taken, the config will not load — so a supervisor or a deploy script sees the failure. `--version` prints the installed version.

<br />

## Configuration

| Option | Default | Description |
|---|---|---|
| `sources` | (required) | Registered API sources |
| `port` | `3001` | Server port |
| `host` | `"localhost"` | Server host |
| `allowedOrigins` | `undefined` | CORS allowed origins (undefined = allow all) |
| `pubsub` | `undefined` | Pub/Sub adapter for horizontal WS scaling (e.g. Redis) |
| `signals` | `true` | Attach SIGTERM/SIGINT for graceful shutdown |

<br />

## API

### `createCourierServer(config: CourierServerConfig): CourierServer`

Creates and starts the server. Returns an object with `url`, `stop()`, `sseConnections`, and `wsConnections`.

<br />

## License

[MIT](../../LICENSE)
