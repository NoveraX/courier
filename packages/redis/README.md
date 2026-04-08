<div align="center">
  <br />

  # @noverax/nexus-redis

  **Redis adapters for Nexus realtime — Pub/Sub broadcast + Streams persistence.**

  <br />

  <a href="https://www.npmjs.com/package/@noverax/nexus-redis"><img src="https://img.shields.io/npm/v/@noverax/nexus-redis?color=7c3aed&style=flat-square" alt="npm" /></a>

  <br />
</div>

<br />

## Install

```bash
npm install @noverax/nexus-redis @noverax/nexus ioredis
```

<br />

## Usage

### Pub/Sub — Horizontal WebSocket Scaling

Broadcasts WebSocket messages across multiple server instances using Redis Pub/Sub:

```ts
import { Redis } from "ioredis"
import { createRedisPubSub } from "@noverax/nexus-redis"

const pubsub = createRedisPubSub({
  publisher: new Redis(),
  subscriber: new Redis(),
  prefix: "nexus:",
})

await pubsub.connect()
```

Pass it to `createNexusServer` or `createWSHandler`:

```ts
import { createNexusServer } from "@noverax/nexus-server"

createNexusServer({ sources, pubsub, port: 3001 })
```

### Streams — SSE Event Persistence

Stores SSE events in Redis Streams for `Last-Event-ID` resume support:

```ts
import { Redis } from "ioredis"
import { createRedisStream } from "@noverax/nexus-redis"

const stream = createRedisStream({
  redis: new Redis(),
  prefix: "nexus:stream:",
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
