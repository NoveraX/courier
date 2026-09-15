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
courier-server --config ./courier.config.ts --port 3001
```

The config file must export a `sources` object.

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
