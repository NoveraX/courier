/**
 * Run as a child of a probe, with `--expose-gc` and an IPC channel: one
 * replica on a port of its own, answering the HTTP transport on `/ws`, and
 * WebSocket upgrades there unless `upgrades` is false — then they are
 * refused with 403, as by an entry that lets none through, so no client
 * climbs back to one. With `redis`, it is one of a cluster on that Redis:
 * the pub/sub adapter, with the topic log, under `prefix`, and the
 * cluster's secret.
 *
 * It tells the probe its port, then does what the probe asks, and answers
 * with the request's `id`: broadcast event `n` to the room, `t` its start
 * on the host's monotonic clock in µs when `timed`; broadcast one every
 * `every` ms, counted from 1, until told to stop, then tell the last; read
 * its heap after a collection, or the processor time it has used; or drain
 * — `destroy()`, every client told to come back elsewhere.
 *
 *   node --expose-gc transports-replica.mjs '{"upgrades":false,"redis":"redis://127.0.0.1:6379"}'
 */
import http from "node:http";
import { argv, cpuUsage, exit, hrtime, memoryUsage } from "node:process";

import { createWSHandler } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { answerTransportRequest, attachWebSocketUpgrade } from "@noverax/courier/node";
import { qualifyTopic } from "@noverax/courier/realtime";
import { createRedisPubSub } from "@noverax/courier-redis";
import { Redis } from "ioredis";
import { WebSocketServer } from "ws";

const { upgrades = true, redis, prefix } = JSON.parse(argv[2] ?? "{}");
const SECRET = "scale-measurement-cluster-secret-0123456789";
/* Kept a topic in the log: what a minute of the probe's events comes to. */
const LOGGED_EVENTS = 5_000;
const TOPIC = qualifyTopic("api.room", { room: "all" });
const gc = /** @type {() => void} */ (globalThis.gc);
const nowUs = () => Number(hrtime.bigint() / 1000n);

const { channel } = courier();
const room = channel
  .send()
  .response()
  .implement(() => ({ onMessage: () => undefined }));
const sources = {
  api: defineApi({ baseURL: "http://127.0.0.1:1", expose: true, endpoints: { room } }),
};

const links = redis === undefined ? [] : [new Redis(redis), new Redis(redis)];
const pubsub =
  redis === undefined
    ? undefined
    : createRedisPubSub({
        publisher: links[0],
        subscriber: links[1],
        prefix,
        log: { maxEvents: LOGGED_EVENTS },
      });
const handler = createWSHandler({
  sources,
  heartbeatIntervalMs: 3_600_000,
  maxConnectionsPerIP: Number.MAX_SAFE_INTEGER,
  onConnect: ({ auth }) => ({ userId: auth?.userId }),
  ...(pubsub && { pubsub, cluster: { secret: SECRET } }),
});

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url?.split("?")[0] === "/ws") {
    answerTransportRequest(req, res, (request, peer) => handler.handleHTTP(request, peer));
    return;
  }
  res.writeHead(404, { "Content-Length": "0" }).end();
});
if (upgrades) {
  attachWebSocketUpgrade(server, {
    path: "/ws",
    createServer: (options) => new WebSocketServer(options),
    onSocket: (socket, request) => handler.handleSocket(socket, request),
  });
} else {
  server.on("upgrade", (_request, socket) => {
    /* A client gone before it read the refusal: nothing to tell it. */
    socket.on("error", () => {});
    socket.end("HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  });
}

let publishing;
let published = 0;

/* What the probe asks, answered. */
const answers = {
  async broadcast({ n, timed }) {
    await handler.connections.broadcastToTopic(TOPIC, timed ? { n, t: nowUs() } : { n });
    return {};
  },
  publish({ every }) {
    publishing = setInterval(() => {
      void handler.connections.broadcastToTopic(TOPIC, { n: ++published });
    }, every);
    return {};
  },
  stop() {
    clearInterval(publishing);
    return { last: published };
  },
  heap() {
    gc();
    return { bytes: memoryUsage().heapUsed };
  },
  cpu() {
    const { user, system } = cpuUsage();
    return { us: user + system };
  },
  stats: () => ({ stats: handler.stats() }),
  async drain() {
    await handler.destroy({ timeoutMs: 10_000 });
    return {};
  },
};

process.on("message", async (message) => {
  const answer = answers[message?.kind];
  if (answer === undefined) return;
  process.send?.({ id: message.id, ...(await answer(message)) });
});
process.on("disconnect", () => exit(0));

await pubsub?.connect();
server.listen(0, "127.0.0.1", () => {
  process.send?.({ kind: "listening", port: server.address().port });
});
