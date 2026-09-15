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

### Streams — SSE Event Persistence

Stores SSE events in Redis Streams for `Last-Event-ID` resume support:

```ts
import { Redis } from "ioredis"
import { createRedisStream } from "@noverax/courier-redis"

const stream = createRedisStream({
  redis: new Redis(),
  prefix: "courier:stream:",
  maxLen: 1000,
})

await stream.connect()
```

<br />

## API

### `createRedisPubSub(config: RedisPubSubConfig): PubSubAdapter`

Creates a Pub/Sub adapter using two ioredis connections (one for publish, one for subscribe). Includes echo prevention via origin IDs and health tracking.

### `createRedisStream(config: RedisStreamConfig): StreamAdapter`

Creates a Streams adapter for durable ordered event storage. Uses `XADD`/`XRANGE`/`XTRIM` with automatic MAXLEN trimming.

<br />

## License

[MIT](../../LICENSE)
