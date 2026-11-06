/**
 * Run inside a fresh Node with `--expose-gc`: drive Courier's WebSocket
 * handler with in-memory sockets — the network left out — to see what the
 * handler itself costs: admitting connections, the heap each holds,
 * subscribing them, fanning a broadcast out, closing a user's connections,
 * a signed command between replicas, a limit on a user's connections, and
 * stopping. Each socket opens as a Courier client's does: its first frame
 * is `auth`, of the protocol's version, and it subscribes once `auth_ok`
 * has let it in. No step is waited on for good: one not done by its
 * deadline stops the probe, which says what it waited for. Prints what it
 * saw, as JSON, or `{ failed }` with why it saw nothing, and exits with 1.
 */
import { argv, exit, stdout } from "node:process";

import { createWSHandler } from "@noverax/courier";
import { courier, defineApi } from "@noverax/courier/define";
import { decodeMessage, encodeMessage, PROTOCOL_VERSION } from "@noverax/courier/internal";
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
/* How long any one step is waited on: many times its budget, so a slow step is still a figure
   over its budget, and only one that never ends stops the probe. */
const STEP_MS = 60_000;

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

/**
 * An accepted socket, held in memory: it reads what it is sent until
 * `auth_ok` lets it in, then only counts it, and closes at once. `tally`,
 * shared by the sockets opened together, counts those let in and those
 * closed before, and keeps the first refusal's code and message.
 */
function socket(tally) {
  const listeners = { message: [], close: [], error: [] };
  let state = 1;
  const held = {
    get readyState() {
      return state;
    },
    bufferedAmount: 0,
    received: 0,
    admitted: false,
    closedWith: undefined,
    send(data) {
      held.received++;
      if (held.admitted) return;
      const frame = decodeMessage(data);
      if (frame.type === "auth_ok") {
        held.admitted = true;
        tally.letIn++;
      } else if (frame.type === "auth_error") tally.refused ??= frame.error;
    },
    close(code) {
      if (state === 3) return;
      state = 3;
      held.closedWith = code;
      if (!held.admitted) tally.shut++;
      queueMicrotask(() => {
        for (const listener of listeners.close) listener({ code: code ?? 1005 });
      });
    },
    addEventListener(type, listener) {
      listeners[type]?.push(listener);
    },
    receive(frame) {
      const data = encodeMessage(frame);
      for (const listener of listeners.message) listener({ data });
    },
  };
  return held;
}

/* Until `done` holds, looked at again after each turn of the event loop; past the step's
   deadline, the probe stops with what it waited for and how far `seen` says it got. */
async function until(step, done, seen) {
  const deadline = performance.now() + STEP_MS;
  while (!done()) {
    if (performance.now() > deadline) {
      throw new Error(`Gave up on ${step} after ${STEP_MS / 1000} s: ${seen()}`);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/* What one of the handler's promises resolves with, or the probe stopped at the step's deadline. */
async function within(step, promise) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Gave up on ${step} after ${STEP_MS / 1000} s`)),
      STEP_MS,
    );
  });
  try {
    return await Promise.race([promise, late]);
  } finally {
    clearTimeout(timer);
  }
}

function serve(extra = {}) {
  return createWSHandler({
    sources,
    heartbeatIntervalMs: 3_600_000,
    maxConnectionsPerIP: Number.MAX_SAFE_INTEGER,
    onConnect: ({ auth }) => ({ userId: auth?.userId }),
    ...extra,
  });
}

/* The first frame a Courier client sends: `auth`, of the protocol's version, with its `ws.auth`. */
function authFrame(userId) {
  return { type: "auth", v: PROTOCOL_VERSION, id: "a1", payload: { auth: { userId } } };
}

/* Open `count` sockets, each saying who it is, until every one is let in or closed for a limit. */
async function admit(handler, count, userOf = (i) => `u${Math.floor(i / PER_USER)}`) {
  const tally = { letIn: 0, shut: 0, refused: undefined };
  const sockets = [];
  const started = performance.now();
  for (let i = 0; i < count; i++) {
    const held = socket(tally);
    handler.handleSocket(held, new Request("http://localhost/api/ws"), "203.0.113.7");
    held.receive(authFrame(userOf(i)));
    sockets.push(held);
  }
  await until(
    "admitting the sockets",
    () => tally.letIn + tally.shut === count,
    () => `${tally.letIn} of ${count} let in, ${tally.shut} closed`,
  );
  return { sockets, ms: performance.now() - started, tally };
}

/* Admitted with no limit, where a socket closed before it was let in is one the server refused. */
async function admitEvery(handler, count, userOf) {
  const admitted = await admit(handler, count, userOf);
  const { shut, refused } = admitted.tally;
  if (shut > 0) {
    const why = refused ? `, the first with ${refused.code} "${refused.message}"` : "";
    throw new Error(`The server refused ${shut} of ${count} sockets${why}`);
  }
  return admitted;
}

/* Warmed up first, as every timed figure is, so the first calls' compiling is not what is timed. */
async function broadcast(handler) {
  for (let round = 0; round < 5; round++)
    await handler.connections.broadcastToTopic(TOPIC, { warm: round });
  const samples = [];
  for (let round = 0; round < 20; round++) {
    const begun = performance.now();
    await handler.connections.broadcastToTopic(TOPIC, { round });
    samples.push(performance.now() - begun);
  }
  return samples;
}

async function closeUsers(handler) {
  for (let user = 50; user < 60; user++) {
    await handler.connections.disconnect({ meta: { userId: `u${user}` } }, { code: 4001 });
  }
  const samples = [];
  for (let user = 0; user < 50; user++) {
    const begun = performance.now();
    await handler.connections.disconnect({ meta: { userId: `u${user}` } }, { code: 4001 });
    samples.push((performance.now() - begun) * 1000);
  }
  return samples;
}

/* A command signed and sent to the other replicas, from the call to the socket closed there. */
async function commandRounds(rounds) {
  const bus = createMemoryBus();
  const replicas = ["a", "b", "c"].map((name) =>
    serve({ pubsub: bus.replica(name), cluster: { secret: SECRET } }),
  );
  const samples = [];
  for (let round = 0; round < rounds; round++) {
    const userId = `remote${round}`;
    const [held] = (await admitEvery(replicas[2], 1, () => userId)).sockets;
    const begun = performance.now();
    await within(
      `sending the command that closes ${userId}'s connection`,
      replicas[0].connections.disconnect({ meta: { userId } }, { code: 4001 }),
    );
    await until(
      `the command closing ${userId}'s connection on another replica`,
      () => held.closedWith !== undefined,
      () => "its socket is still open",
    );
    samples.push(performance.now() - begun);
  }
  await within(
    "stopping the replicas",
    Promise.all(replicas.map((replica) => replica.destroy({ timeoutMs: 1_000 }))),
  );
  return samples;
}

/* A limit on each user's connections: what it adds to each admission, evictions included. */
async function limitOverhead() {
  const LIMITED = Math.min(CONNECTIONS, 5_000);
  const kept = (LIMITED / PER_USER) * 3;
  const unlimitedHandler = serve();
  const unlimited = await admitEvery(unlimitedHandler, LIMITED);
  await within("stopping the handler", unlimitedHandler.destroy({ timeoutMs: 1_000 }));
  const limitedHandler = serve({
    maxConnectionsPerKey: { key: (meta) => meta.userId, max: 3 },
    connectionLeases: createMemoryConnectionLeases(),
  });
  const limited = await admit(limitedHandler, LIMITED);
  await until(
    `the limit keeping ${kept} of ${LIMITED} connections`,
    () => limitedHandler.stats().connections === kept,
    () => `${limitedHandler.stats().connections} open`,
  );
  await within("stopping the handler", limitedHandler.destroy({ timeoutMs: 1_000 }));
  return ((limited.ms - unlimited.ms) / LIMITED) * 1000;
}

async function measure() {
  /* Admitting, the heap each connection holds, subscribing, broadcasting, closing a user's. */
  gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const handler = serve();
  const admitted = await admitEvery(handler, CONNECTIONS);
  gc();
  const heapPerConnectionKb = (process.memoryUsage().heapUsed - heapBefore) / CONNECTIONS / 1024;

  const subscribing = performance.now();
  for (const [i, held] of admitted.sockets.entries()) {
    held.receive({ type: "subscribe", id: `s${i}`, topic: TOPIC, payload: { room: "all" } });
  }
  await until(
    `subscribing ${CONNECTIONS} connections`,
    () => handler.stats().subscriptions === CONNECTIONS,
    () => `${handler.stats().subscriptions} subscribed`,
  );
  const subscribeMs = performance.now() - subscribing;

  /* From here, what a socket is sent is the broadcasts alone: 5 to warm up and 20 timed. */
  for (const held of admitted.sockets) held.received = 0;
  const broadcasts = await within(`broadcasting to ${CONNECTIONS} connections`, broadcast(handler));
  const delivered = admitted.sockets.every((held) => held.received === 25);
  const closings = await within("closing users' connections", closeUsers(handler));

  const stopping = performance.now();
  await within("stopping the handler", handler.destroy({ timeoutMs: 10_000 }));
  const destroyMs = performance.now() - stopping;

  const commands = await commandRounds(50);
  const limitOverheadUs = await limitOverhead();
  return {
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
  };
}

const seen = await measure().catch((error) => ({
  failed: error instanceof Error ? error.message : String(error),
}));
/* Out once the line is written: the handlers of a step that failed would hold the probe open. */
stdout.write(`${JSON.stringify(seen)}\n`, () => exit(seen.failed === undefined ? 0 : 1));
