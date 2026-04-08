<div align="center">
  <br />

  # @noverax/nexus-server

  **Standalone HTTP + WebSocket server for Nexus.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-server"><img src="https://img.shields.io/npm/v/@noverax/nexus-server?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Overview

A zero-config standalone server that handles HTTP (GET/POST), SSE streams, and WebSocket upgrades. Includes CORS, health checks, and graceful shutdown out of the box.

<br />

## Install

```bash
npm install @noverax/nexus-server @noverax/nexus ws
```

<br />

## Usage

### Programmatic

```ts
import { createNexusServer } from "@noverax/nexus-server"
import { sources } from "./api"

const server = createNexusServer({
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
nexus-server --config ./nexus.config.ts --port 3001
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

### `createNexusServer(config: NexusServerConfig): NexusServer`

Creates and starts the server. Returns an object with `url`, `stop()`, `sseConnections`, and `wsConnections`.

<br />

## License

[MIT](../../LICENSE)
