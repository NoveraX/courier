/**
 * Run inside a fresh Node with `--expose-gc`: drive Courier's WebSocket
 * handler with in-memory sockets — the network left out — to see what the
 * handler itself costs: admitting connections, the heap each holds,
 * subscribing them, fanning a broadcast out, closing a user's connections,
 * a signed command between replicas, a limit on a user's connections, and
 * stopping. Prints what it saw, as JSON.
 */
import { argv } from "node:process";

import { createWSHandler } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import {
  createMemoryBus,
  createMemoryConnectionLeases,
  qualifyTopic,
} from "@noverax/courier/realtime";

import { percentiles } from "./metrics.mjs";

const [connectionsArg = "10000"] = argv.slice(2);
const CONNECTIONS = Number(connectionsArg);
const PER_USER = 5;
const SECRET = "scale-measurement-cluster-secret-0123456789";

const { channel } = courier();
const room = channel
  .send()
  .response()
  .implement(() => ({ onMessage: () => undefined }));
const sources = {
  api: defineApi({ baseURL: "http://127.0.0.1:1", expose: true, endpoints: { room } }),
};
const TOPIC = qualifyTopic("api.room", { room: "all" });
const gc = /** @type {() => void} */ (globalThis.gc);

/** An accepted socket, held in memory: it counts what it is sent, and closes at once. */
function socket() {
  const listeners = { message: [], close: [], error: [] };
  let state = 1;
  const held = {
    get readyState() {
      return state;
    },
    bufferedAmount: 0,
    received: 0,
    closedWith: undefined,
    send() {
      held.received++;
    },
    close(code) {
      if (state === 3) return;
      state = 3;
      held.closedWith = code;
      queueMicrotask(() => {
        for (const listener of listeners.close) listener({ code: code ?? 1005 });
      });
    },
    addEventListener(type, listener) {
      listeners[type]?.push(listener);
    },
    receive(frame) {
      for (const listener of listeners.message) listener({ data: JSON.stringify(frame) });
    },
  };
  return held;
}

const until = async (done) => {
  while (!done()) await new Promise((resolve) => setImmediate(resolve));
};

function serve(extra = {}) {
  return createWSHandler({
    sources,
    heartbeatIntervalMs: 3_600_000,
    maxConnectionsPerIP: Number.MAX_SAFE_INTEGER,
    onConnect: ({ auth }) => ({ userId: auth?.userId }),
    ...extra,
  });
}

async function admit(handler, count) {
  const sockets = [];
  const started = performance.now();
  for (let i = 0; i < count; i++) {
    const held = socket();
    handler.handleSocket(held, new Request("http://localhost/api/ws"), "203.0.113.7");
    held.receive({ type: "auth", payload: { auth: { userId: `u${Math.floor(i / PER_USER)}` } } });
    sockets.push(held);
  }
  /* Every socket registered, or closed for a limit: none left being admitted. */
  await until(() => handler.stats().admitting === 0);
  return { sockets, ms: performance.now() - started };
}

/* Admitting, the heap each connection holds, subscribing, broadcasting, closing a user's. */
gc();
const heapBefore = process.memoryUsage().heapUsed;
const handler = serve();
const admitted = await admit(handler, CONNECTIONS);
gc();
const heapPerConnectionKb = (process.memoryUsage().heapUsed - heapBefore) / CONNECTIONS / 1024;

const subscribing = performance.now();
for (const [i, held] of admitted.sockets.entries()) {
  held.receive({ type: "subscribe", id: `s${i}`, topic: TOPIC, payload: { room: "all" } });
}
await until(() => handler.stats().subscriptions === CONNECTIONS);
const subscribeMs = performance.now() - subscribing;

/* Warmed up first, as every timed figure is, so the first calls' compiling is not what is timed. */
for (let round = 0; round < 5; round++)
  await handler.connections.broadcastToTopic(TOPIC, { warm: round });
const broadcasts = [];
for (let round = 0; round < 20; round++) {
  const begun = performance.now();
  await handler.connections.broadcastToTopic(TOPIC, { round });
  broadcasts.push(performance.now() - begun);
}
const delivered = admitted.sockets.every((held) => held.received >= 25);

for (let user = 50; user < 60; user++) {
  await handler.connections.disconnect({ meta: { userId: `u${user}` } }, { code: 4001 });
}
const closings = [];
for (let user = 0; user < 50; user++) {
  const begun = performance.now();
  await handler.connections.disconnect({ meta: { userId: `u${user}` } }, { code: 4001 });
  closings.push((performance.now() - begun) * 1000);
}

const stopping = performance.now();
await handler.destroy({ timeoutMs: 10_000 });
const destroyMs = performance.now() - stopping;

/* A command signed and sent to the other replicas, from the call to the socket closed there. */
const bus = createMemoryBus();
const replicas = ["a", "b", "c"].map((name) =>
  serve({ pubsub: bus.replica(name), cluster: { secret: SECRET } }),
);
const commands = [];
for (let round = 0; round < 50; round++) {
  const held = socket();
  replicas[2].handleSocket(held, new Request("http://localhost/api/ws"), "203.0.113.7");
  held.receive({ type: "auth", payload: { auth: { userId: `remote${round}` } } });
  await until(
    () => replicas[2].connections.list({ meta: { userId: `remote${round}` } }).length === 1,
  );
  const begun = performance.now();
  await replicas[0].connections.disconnect({ meta: { userId: `remote${round}` } }, { code: 4001 });
  await until(() => held.closedWith !== undefined);
  commands.push(performance.now() - begun);
}
await Promise.all(replicas.map((replica) => replica.destroy({ timeoutMs: 1_000 })));

/* A limit on each user's connections: what it adds to each admission, evictions included. */
const LIMITED = Math.min(CONNECTIONS, 5_000);
const unlimitedHandler = serve();
const unlimited = await admit(unlimitedHandler, LIMITED);
await unlimitedHandler.destroy({ timeoutMs: 1_000 });
const limitedHandler = serve({
  maxConnectionsPerKey: { key: (meta) => meta.userId, max: 3 },
  connectionLeases: createMemoryConnectionLeases(),
});
const limited = await admit(limitedHandler, LIMITED);
await until(() => limitedHandler.stats().connections === (LIMITED / PER_USER) * 3);
const limitOverheadUs = ((limited.ms - unlimited.ms) / LIMITED) * 1000;
await limitedHandler.destroy({ timeoutMs: 1_000 });

console.log(
  JSON.stringify({
    connections: CONNECTIONS,
    admitMs: admitted.ms,
    heapPerConnectionKb,
    subscribeMs,
    broadcast: percentiles(broadcasts),
    delivered,
    disconnectByMeta: percentiles(closings),
    destroyMs,
    command: percentiles(commands),
    limitOverheadUs: Math.max(0, limitOverheadUs),
  }),
);
