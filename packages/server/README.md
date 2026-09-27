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
  host: "127.0.0.1",
  allowedOrigins: ["http://localhost:3000"],
  onReady: (url) => console.log(`Server ready at ${url}`),
})

// server.url → "http://127.0.0.1:3001"
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

The command serves the default request body limits, 1 MB for a JSON envelope and 10 MB for an upload; to change them, start the server from code with `maxBodyBytes` and `maxUploadBytes`.

The command exits with status 1 when the server cannot start — the port is taken, the config will not load — so a supervisor or a deploy script sees the failure. `--version` prints the installed version.

<br />

## Configuration

| Option | Default | Description |
|---|---|---|
| `sources` | (required) | The API sources this server answers for. They stay its own: a second server or a `registerSources` call in the same process does not change them, and the server does not write them into the process-wide registry |
| `port` | `3001` | Server port |
| `host` | `"127.0.0.1"` | Address to listen on. The IPv4 loopback, which a client given `localhost` reaches too; `"::1"` for the IPv6 loopback, `"0.0.0.0"` or `"::"` to accept other machines, as a container needs |
| `allowedOrigins` | `undefined` | Origins of the browser apps that may call the server (CORS and the WebSocket origin check). Left out, only the server's own origin — and loopback origins outside production |
| `maxBodyBytes` | 1 MB | Largest JSON envelope a proxied call may send; a larger one is refused with 413 |
| `maxUploadBytes` | 10 MB | Largest `multipart/form-data` upload a proxied call may send; a larger one is refused with 413 |
| `pubsub` | `undefined` | Pub/Sub adapter for horizontal WS scaling (e.g. Redis) |
| `maxConnectionsPerIP` | `50` | WebSocket connections one address may hold; raise it for clients behind a shared NAT or proxy |
| `clientIp` | the socket's address | Names the address a WebSocket connection is counted against |
| `maxSubscriptionsPerConnection` | `100` | Subscriptions one WebSocket connection may hold |
| `maxMessageSize` | `65536` | Largest WebSocket message Courier accepts, in bytes; a larger one is refused with a `4413` error and the connection stays open |
| `maxPayload` | 1 MB, or twice `maxMessageSize` | Largest WebSocket frame read at all, in bytes; a bigger one closes the connection with `1009` before it is buffered |
| `maxMessagesPerSecond` | `100` | Messages one WebSocket connection may send per second |
| `authorize` | `undefined` | Decides whether a WebSocket subscription may start |
| `authorizeMessage` | `undefined` | Decides whether a message sent on a channel is accepted |
| `onTokenRefresh` | `undefined` | Accepts a refreshed token on an open WebSocket connection |
| `signals` | `true` | Drain on SIGTERM/SIGINT, then exit — unless the application handles the signal too, in which case its handler decides when the process ends |

Every other option of the core HTTP and WebSocket handlers is accepted and passed on as well: the SSE lifecycle hooks and limits, `onConnect`, `onDisconnect`, `onError`, the heartbeat timings and the slow-consumer limits.

### CORS

A page on an allowed origin may send the headers its preflight asks for; which of them reach the upstream is still decided by each source's and endpoint's header allowlist. Its answers carry `Access-Control-Expose-Headers` naming every header the proxy passes back, so the page can read `Retry-After`, `ETag` or `Content-Disposition` as a same-origin page would. Behind a proxy on a loopback or private address, the server's own origin is the one in `X-Forwarded-Proto` and `X-Forwarded-Host`.

### Logs

Info lines go to stdout, warnings and errors to stderr, with the error's stack and cause chain. `COURIER_LOG_LEVEL` sets the lowest level printed — `debug`, `info` (default), `warn`, `error` or `silent`. Colour appears on a terminal only; `NO_COLOR` turns it off and `FORCE_COLOR=1` on. See [Logging](../core/README.md#logging).

<br />

## API

### `createCourierServer(options: CourierServerOptions): CourierServer`

Creates and starts the server. Returns an object with `url`, `ready` (resolves once listening, rejects when the server cannot start), `stop()`, `sseConnections`, and `wsConnections`.

<br />

## License

[MIT](../../LICENSE)
