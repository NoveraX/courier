<div align="center">
  <br />
  <a href="https://courier.noverax.cloud">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-light.svg" />
      <img alt="Courier" src="https://raw.githubusercontent.com/NoveraX/courier/master/docs/public/logos/courier-mark-dark.svg" height="44" />
    </picture>
  </a>

  <h1>Courier for Redis</h1>

  <p><strong>Realtime that holds across replicas.</strong></p>

  <p>Run Courier's WebSocket channels and SSE streams on as many instances as you need: Pub/Sub carries each broadcast to every replica, presence is shared between them, and Streams keep the events a reconnecting client resumes from.</p>

  <p>
    <a href="https://www.npmjs.com/package/@noverax/courier-redis"><img alt="npm" src="https://img.shields.io/npm/v/@noverax/courier-redis?style=flat-square&label=npm&labelColor=08090a&color=1c63d6" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript strict" src="https://img.shields.io/badge/typescript-strict-1c63d6?style=flat-square&labelColor=08090a" /></a>
    <a href="https://github.com/NoveraX/courier/blob/master/LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1c63d6?style=flat-square&labelColor=08090a" /></a>
  </p>

  <p>
    <a href="https://courier.noverax.cloud/docs/deployment/redis"><strong>Redis guide</strong></a>
    &nbsp;·&nbsp;
    <a href="https://courier.noverax.cloud/docs">Documentation</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier#readme">Courier</a>
    &nbsp;·&nbsp;
    <a href="https://github.com/NoveraX/courier/tree/master/packages/redis">Source</a>
  </p>
  <br />
</div>

<br />

## Overview

Three adapters on `ioredis`, each plugging into a seam the core already has: a Pub/Sub adapter for the WebSocket handler, a presence adapter for channels, and a Streams adapter for the history a stream resumes from.

<table>
  <tr>
    <td width="33%" valign="top">
      <h4>Pub/Sub</h4>
      <code>createRedisPubSub</code> delivers each channel message to every replica, without echo.
    </td>
    <td width="33%" valign="top">
      <h4>Presence</h4>
      <code>createRedisPresence</code> keeps who is on a topic in Redis, so every replica lists the same people.
    </td>
    <td width="33%" valign="top">
      <h4>Stream history</h4>
      <code>createRedisStream</code> keeps events in Redis Streams, trimmed, for a client that reconnects anywhere.
    </td>
  </tr>
</table>

<br />

## Install

```bash
npm install @noverax/courier-redis @noverax/courier ioredis
```

`ioredis` 5.3 or later: its named `Redis` export is what the types use.

<br />

## Usage

### Pub/Sub — Horizontal WebSocket Scaling

Broadcasts WebSocket messages across multiple server instances using Redis Pub/Sub:

```ts
import { Redis } from "ioredis"
import { createRedisPubSub } from "@noverax/courier-redis"

const pubsub = createRedisPubSub({
  publisher: new Redis(),
  subscriber: new Redis(),
  prefix: "courier:",
})

await pubsub.connect()
```

Pass it to `createCourierServer` or `createWSHandler`:

```ts
import { createCourierServer } from "@noverax/courier-server"

createCourierServer({ sources, pubsub, port: 3001 })
```

### Streams — SSE Event History

Keeps a stream's events in Redis Streams, so a client that reconnects to any replica can be sent what it missed. The server does not use it on its own: the code that produces an event appends it, and the stream's handler replays `getHistory(topic, ctx.lastEventId)` and yields each event with `tracked(event.id, …)`, so the id its client resumes from is the Redis one.

```ts
import { Redis } from "ioredis"
import { createRedisStream } from "@noverax/courier-redis"
import { courier } from "@noverax/courier/define"
import { tracked } from "@noverax/courier/realtime"

const history = createRedisStream({
  redis: new Redis(),
  prefix: "courier:stream:",
  maxLen: 1000,
})

await history.connect()

// Wherever an event happens
await history.append("activity:team-1", { data: { user: "ann" }, timestamp: Date.now() })

// The stream's handler sends what its client missed, after its Last-Event-ID
const { stream } = courier()

export const feed = stream.response<unknown>().implement(async function* (ctx) {
  for (const event of await history.getHistory("activity:team-1", ctx.lastEventId ?? "0")) {
    yield tracked(event.id, event.data)
  }
})
```

The [Redis adapters guide](https://courier.noverax.cloud/docs/deployment/redis) has a complete handler that resumes across replicas, and presence used from a channel's handlers.

### Presence — Who Is On a Topic, Across Replicas

Keeps who is on a topic in Redis — a sorted set of each connection's last heartbeat, a hash of its metadata — so every replica lists the same people. Give it a second connection as `subscriber`, and `onDiff` hears the joins and leaves of every replica, not only its own:

```ts
import { Redis } from "ioredis"
import { createRedisPresence } from "@noverax/courier-redis"

const presence = createRedisPresence({ redis: new Redis(), subscriber: new Redis() })

await presence.connect()

// In a channel's handlers: track a connection when it joins, untrack it when it leaves
await presence.track("room:general", { userId: "ann", connectionId: "conn_1", metadata: { status: "online" } })
const here = await presence.list("room:general")

// Hear every replica's joins and leaves
const stop = presence.onDiff("room:general", (diff) => console.log(diff.joins.length, "joined", diff.leaves.length, "left"))

// Remove connections without a heartbeat in the last 30 seconds
setInterval(() => presence.sweep("room:general", 30_000), 10_000)
```

<br />

## API

### `createRedisPubSub(config: RedisPubSubConfig): PubSubAdapter`

Creates a Pub/Sub adapter using two ioredis connections (one for publish, one for subscribe). Includes echo prevention via origin IDs and health tracking.

### `createRedisStream(config: RedisStreamConfig): StreamAdapter`

Creates a Streams adapter for durable ordered event storage. Uses `XADD`/`XRANGE`/`XTRIM` with automatic MAXLEN trimming.

### `createRedisPresence(config: RedisPresenceConfig): PresenceAdapter`

Creates a presence adapter: `track`, `heartbeat`, `untrack`, `list`, `sweep` and `onDiff` over a sorted set and a hash per topic, with the diffs broadcast to the other replicas through the `subscriber` connection.

<br />

## Part of Courier

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/core"><strong>@noverax/courier</strong></a><br />
      Define your API once; call it typed from server code and the browser.
    </td>
    <td width="50%" valign="top">
      <a href="https://github.com/NoveraX/courier/tree/master/packages/server"><strong>@noverax/courier-server</strong></a><br />
      The proxy, its streams and channels on a port of their own.
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
