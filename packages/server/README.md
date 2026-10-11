<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier Server</h1>

  <p><strong>Your API's proxy, its streams and its channels — on a port of their own.</strong></p>

  <p>A standalone server for front ends with no server of their own — a static site, a mobile app, a serverless deploy: HTTP, SSE and WebSockets, with CORS, health checks and a graceful shutdown, from one command.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-server"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-server?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/deployment/standalone-server"><strong>Standalone server guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/server">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

`courier-server` serves the proxy for the sources in your `courier.config.ts` — calls, SSE streams and WebSocket channels — on its own port, ready for a container, a Kubernetes pod or a process manager.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>One command</h4>
      <code>npx @noverax/courier-server</code> serves your config's sources; flags or its <code>server</code> block set the rest.
    </td>
    <td width="33%" valign="top">
      <h4>HTTP, SSE, WebSockets</h4>
      Every transport your API defines, with per-address, per-connection and per-second limits.
    </td>
    <td width="33%" valign="top">
      <h4>Scale out</h4>
      A Redis Pub/Sub adapter carries channels across replicas.
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h4>Graceful shutdown</h4>
      On SIGTERM it drains streams and sockets, telling each client when to come back, then exits.
    </td>
    <td valign="top">
      <h4>Fails loudly</h4>
      A taken port or a config that will not load exits with status 1, for supervisors and deploy scripts.
    </td>
    <td valign="top">
      <h4>Secure by default</h4>
      Allowed origins and hosts, a WebSocket origin check, and a 421 for a DNS-rebinding host.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install @noverax/courier-server @noverax/courier
```

To serve WebSocket channels, add `ws` too: `npm install ws`. A server without it serves HTTP and SSE, and answers a WebSocket upgrade with a 500 whose log line says to install it.

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

Without `onReady` the server logs `Listening on <url>` once it listens; with it, the callback announces the address in that line's place, so it is said once.

### CLI

```bash
npx @noverax/courier-server
npx @noverax/courier-server --config ./deploy/courier.config.ts --port 3001 --allowed-origins https://app.example.com --allowed-hosts api.example.com
```

Without `--config` it serves the `courier.config.*` in the working directory; a `--config` path is relative to it. TypeScript configs load as they are, extensionless imports and tsconfig path aliases included. The config needs `sources`, and its `server` block supplies what the flags leave out:

```ts
// courier.config.ts
import { defineConfig } from "@noverax/courier/config"
import { api } from "./src/api"

export default defineConfig({
  sources: { api },
  server: {
    port: 3001,
    allowedOrigins: ["https://app.example.com"],
    maxUploadBytes: 67_108_864, // 64 MB uploads
  },
})
```

The `server` block also sets the request body limits: `maxBodyBytes` for a JSON envelope (1 MB by default) and `maxUploadBytes` for an upload (10 MB by default). A value that is not a whole number of bytes above 0 stops the command with a message naming the key.

The command exits with status 1 when the server cannot start — the port is taken, the config will not load — so a supervisor or a deploy script sees the failure. `--version` prints the installed version.

<br />

## Configuration

| Option | Default | Description |
|---|---|---|
| `sources` | (required) | The API sources this server answers for. They stay its own: a second server or a `registerSources` call in the same process does not change them, and the server does not write them into the process-wide registry |
| `port` | `3001` | Server port |
| `host` | `"127.0.0.1"` | Address to listen on. The IPv4 loopback, which a client given `localhost` reaches too; `"::1"` for the IPv6 loopback, `"0.0.0.0"` or `"::"` to accept other machines, as a container needs |
| `allowedOrigins` | `undefined` | Origins of the browser apps that may call the server (CORS and the WebSocket origin check), written as a browser sends them: `https://app.example.com`, with no trailing slash — an entry that could never match stops the server from starting. Left out, only the server's own origin — and loopback origins outside production |
| `allowedHosts` | `undefined` | Host names the server is reached by. A request addressed to any other host gets 421, and a socket is closed with 4421, as a DNS-rebinding page's would be. `localhost`, `*.localhost` and IP addresses are always served; left out, production serves every name and development nothing else |
| `maxBodyBytes` | 1 MB | Largest JSON envelope a proxied call may send; a larger one is refused with 413 |
| `maxUploadBytes` | 10 MB | Largest `multipart/form-data` upload a proxied call may send; a larger one is refused with 413 |
| `pubsub` | `undefined` | Pub/Sub adapter for horizontal WS scaling (e.g. Redis) |
| `maxConnectionsPerIP` | `50` | WebSocket connections one address may hold; raise it for clients behind a shared NAT or proxy |
| `clientIp` | the socket's address | Names the address a WebSocket connection is counted against |
| `maxSubscriptionsPerConnection` | `100` | Subscriptions one WebSocket connection may hold; its subscribe, unsubscribe and auth frames are limited to twice this a second, apart from its other messages, and one past the limit is refused with a `4429` error |
| `maxMessageSize` | `65536` | Largest WebSocket message Courier accepts, in bytes; a larger one is refused with a `4413` error and the connection stays open |
| `maxPayload` | 1 MB, or twice `maxMessageSize` | Largest WebSocket frame read at all, in bytes; a bigger one closes the connection with `1009` before it is buffered |
| `maxMessagesPerSecond` | `100` | Messages one WebSocket connection may send per second; one past the limit is refused with a `4429` error |
| `authorize` | `undefined` | Decides whether a WebSocket subscription may start |
| `authorizeMessage` | `undefined` | Decides whether a message sent on a channel is accepted |
| `authTimeoutMs` | `3000` | How long `onConnect` waits for the client's `auth` frame, the first a Courier client sends; a client that sends none by then is admitted on its handshake alone |
| `onReauth` | `undefined` | Checks the credentials a client sends again on an open WebSocket connection, as `sendAuthRequired` asks, and returns its new metadata; without it every such frame is refused, so the connection is closed at the deadline |
| `signals` | `true` | Drain on SIGTERM/SIGINT, then exit — unless the application handles the signal too, in which case its handler decides when the process ends |

Every other option of the core HTTP and WebSocket handlers is accepted and passed on as well: the SSE lifecycle hooks and limits, `onConnect`, `onDisconnect`, `onError`, the heartbeat timings and the slow-consumer limits.

### CORS

A page on an allowed origin may send the headers its preflight asks for; which of them reach the upstream is still decided by each source's and endpoint's header allowlist. Its answers carry `Access-Control-Expose-Headers` naming every header the proxy passes back, so the page can read `Retry-After`, `ETag` or `Content-Disposition` as a same-origin page would. Behind a proxy on a loopback or private address, the server's own origin is the one in `X-Forwarded-Proto` and `X-Forwarded-Host`.

### Logs

Info lines go to stdout, warnings and errors to stderr, with the error's stack and cause chain. `COURIER_LOG_LEVEL` sets the lowest level printed — `debug`, `info` (default), `warn`, `error` or `silent` — and `COURIER_LOG_FORMAT=json` writes one JSON object per line, for a log pipeline. Colour appears on a terminal only; `NO_COLOR` turns it off and `FORCE_COLOR=1` on. Started in a terminal, `courier-server` prints a banner with its version, address, config and sources; anywhere else — a container, a pipe — it logs one `Courier Server v… ready at …` line instead. See [Logging](https://github.com/NoveraX/courier/tree/master/packages/core#logging).

<br />

## API

### `createCourierServer(options: CourierServerOptions): CourierServer`

Creates and starts the server. Returns an object with `url`, `ready` (resolves once listening, rejects when the server cannot start), `stop()`, `sseConnections`, and `wsConnections`.

<br />

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/redis"><strong>@noverax/courier-redis</strong></a><br />
      Channels, presence and stream history across replicas.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/studio"><strong>@noverax/courier-studio</strong></a><br />
      See every request your app makes, live.
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
