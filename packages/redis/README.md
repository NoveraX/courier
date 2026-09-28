<div align="center">
  <br />

  # @noverax/courier-redis

  **Redis adapters for Courier realtime — Pub/Sub broadcast + Streams persistence.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/courier-redis"><img src="https://img.shields.io/npm/v/@noverax/courier-redis?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

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

<br />

## API

### `createRedisPubSub(config: RedisPubSubConfig): PubSubAdapter`

Creates a Pub/Sub adapter using two ioredis connections (one for publish, one for subscribe). Includes echo prevention via origin IDs and health tracking.

### `createRedisStream(config: RedisStreamConfig): StreamAdapter`

Creates a Streams adapter for durable ordered event storage. Uses `XADD`/`XRANGE`/`XTRIM` with automatic MAXLEN trimming.

<br />

## License

[MIT](../../LICENSE)
