/**
 * Run inside a fresh Node, `REDIS_URL` naming a Redis it may write to:
 * what replicas with no affinity cost each other over HTTP, each replica
 * and Courier's clients in processes of their own. Prints what it saw, as
 * JSON, or `{ failed }` with why it saw nothing, and exits with 1.
 *
 * Requests sent on: two replicas, connections held by the first on its
 * streams, and their `send` requests — a ping each, its pong taken on the
 * stream — answered by the first, and the same sent to the second, which
 * sends them on to the first over Redis: how long each takes, and how many
 * the second sends on in a second with 64 in flight.
 *
 * A storm: three replicas with the topic log behind an entry that deals
 * requests out in turn and refuses upgrades, thousands of connections on
 * streams — a third of them on each replica — one replica broadcasting an
 * event every 200 ms, as a busy room has them. Another is drained — taken
 * out of the entry's turn, then `destroy()`, its clients told to come back
 * elsewhere — and killed: how long until 99 % are subscribed again, and the
 * events each connection missed, from its first to the last broadcast, or
 * had twice.
 *
 * The way back: connections that climbed down to HTTP behind the same
 * entry, which then lets upgrades through, the broadcasts going on: how
 * long until WebSocket carries every one again — each comes back once its
 * probe gets through, the first within 30 s of its socket over HTTP
 * opening — and the events each missed or had twice meanwhile.
 *
 *   REDIS_URL=redis://127.0.0.1:6379 node transports-cluster-probe.mjs [connections]
 */
import { availableParallelism } from "node:os";
import { argv, env, exit, hrtime, pid, stdout } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { PROTOCOL_VERSION } from "@noverax/courier/internal";
/* npm's undici, as the clients' processes have it: Node 24's own ends the process on a socket
   reset under it. */
import { fetch } from "undici";

import { percentiles } from "./metrics.mjs";
import { startEntry } from "./transports-entry.mjs";
import { startClients, startReplica } from "./transports-processes.mjs";

const [connectionsArg = "6000"] = argv.slice(2);
const STORM = Number(connectionsArg);
const WAY_BACK = 1_000;
const PROCESSES = Math.max(2, Math.min(8, availableParallelism() - 4));
/* The version of the HTTP transport this probe speaks to the replicas itself. */
const HTTP_VERSION = 1;
const TEXT = { "content-type": "text/plain;charset=UTF-8" };
const PING = JSON.stringify({ type: "ping" });
const TIMED = { connections: 8, sends: 250, warm: 50 };
const LOAD = { inFlight: 64, ms: 3_000 };
const EVENT_MS = 200;
const OPEN_MS = 30_000;
const nowUs = () => Number(hrtime.bigint() / 1000n);
const httpOf = (url) => url.replace(/^ws/, "http");

/* A connection on a stream of `url`'s replica: its token, from the stream's first event, and the
   last frame it had, which each of its requests acknowledges. */
async function openStream(url, userId) {
  const auth = { type: "auth", v: PROTOCOL_VERSION, id: "a0", payload: { auth: { userId } } };
  const response = await fetch(httpOf(url), {
    method: "POST",
    headers: TEXT,
    body: `${JSON.stringify({ op: "stream", v: HTTP_VERSION })}\n${JSON.stringify(auth)}`,
    signal: AbortSignal.timeout(OPEN_MS),
  });
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const held = { token: undefined, last: 0, seq: 0, close: () => reader.cancel().catch(() => {}) };
  let pending = "";
  while (held.token === undefined) {
    const { value, done } = await reader.read();
    if (done) throw new Error(`A stream ended before it was opened: ${response.status}`);
    pending += value;
    const end = pending.indexOf("\n\n");
    if (end !== -1 && pending.startsWith("event: open\ndata: ")) {
      held.token = JSON.parse(pending.slice("event: open\ndata: ".length, end)).token;
    }
  }
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      for (const [, id] of value.matchAll(/^id: (\d+)$/gm)) held.last = Number(id);
    }
  })();
  return held;
}

/* A ping sent on `held`'s connection by way of `url`'s replica: how long its answer took, in ms. */
async function send(url, held) {
  const head = { op: "send", token: held.token, seq: ++held.seq, ack: held.last };
  const begun = performance.now();
  const response = await fetch(httpOf(url), {
    method: "POST",
    headers: TEXT,
    body: `${JSON.stringify(head)}\n${PING}`,
  });
  await response.arrayBuffer();
  if (response.status !== 204) throw new Error(`A send was answered ${response.status}`);
  return performance.now() - begun;
}

async function measureForwarding(redis, prefix) {
  const owner = await startReplica({ upgrades: false, redis, prefix });
  const other = await startReplica({ upgrades: false, redis, prefix });
  const held = [];
  try {
    for (let i = 0; i < LOAD.inFlight; i++) held.push(await openStream(owner.url, `f${i}`));
    const timed = held.slice(0, TIMED.connections);
    const direct = [];
    const forwarded = [];
    for (let round = 0; round < TIMED.warm + TIMED.sends; round++) {
      await Promise.all(
        timed.map(async (connection) => {
          const here = await send(owner.url, connection);
          const there = await send(other.url, connection);
          if (round < TIMED.warm) return;
          direct.push(here);
          forwarded.push(there);
        }),
      );
    }
    let sent = 0;
    const deadline = performance.now() + LOAD.ms;
    await Promise.all(
      held.map(async (connection) => {
        while (performance.now() < deadline) {
          await send(other.url, connection);
          sent++;
        }
      }),
    );
    return {
      direct: percentiles(direct),
      forwarded: percentiles(forwarded),
      perSecond: sent / (LOAD.ms / 1000),
    };
  } finally {
    await Promise.all(held.map((connection) => connection.close()));
    owner.kill();
    other.kill();
  }
}

async function measureStorm(redis, prefix) {
  const replicas = [];
  for (let i = 0; i < 3; i++) replicas.push(await startReplica({ upgrades: false, redis, prefix }));
  const [drained, publisher] = replicas;
  const entry = await startEntry(replicas.map((replica) => replica.port));
  const clients = startClients(entry.url, "stream", STORM, PROCESSES, entry.socketPath);
  try {
    await clients.when(({ subscribed }) => subscribed === STORM, `${STORM} connections subscribed`);
    const { stats } = await drained.ask("stats");
    await publisher.ask("publish", { every: EVENT_MS });
    await sleep(1_000);
    const begun = nowUs();
    entry.remove(drained.port);
    const draining = drained.ask("drain");
    await clients.when(
      ({ subscribed }) => subscribed < 0.99 * STORM,
      "the drained replica's clients gone",
    );
    const most = await clients.when(
      ({ subscribed }) => subscribed >= 0.99 * STORM,
      "99 % subscribed again",
    );
    const every = await clients
      .when(({ subscribed }) => subscribed === STORM, "all subscribed again")
      .catch(async () => ({ stuck: await clients.stuck() }));
    await draining;
    drained.kill();
    await sleep(1_000);
    const { last } = await publisher.ask("stop");
    const seen = await clients.awaitEvent(last);
    return {
      connections: STORM,
      drainedHeld: stats.connections,
      mostBackMs: (most - begun) / 1000,
      allBackMs: typeof every === "number" ? (every - begun) / 1000 : null,
      ...(typeof every === "number" ? {} : every),
      events: last,
      ...tallied(seen),
    };
  } finally {
    await clients.close();
    await entry.close();
    for (const replica of replicas) replica.kill();
  }
}

async function measureWayBack(redis, prefix) {
  const replicas = [];
  for (let i = 0; i < 2; i++) replicas.push(await startReplica({ redis, prefix }));
  const [publisher] = replicas;
  const entry = await startEntry(replicas.map((replica) => replica.port));
  const clients = startClients(entry.url, "ladder", WAY_BACK, PROCESSES, entry.socketPath);
  try {
    await clients.when(
      ({ subscribed, websocket }) => subscribed === WAY_BACK && websocket === 0,
      `${WAY_BACK} connections subscribed over HTTP`,
    );
    await publisher.ask("publish", { every: EVENT_MS });
    const begun = nowUs();
    entry.passUpgrades();
    const back = await clients.when(
      ({ subscribed, websocket }) => subscribed === WAY_BACK && websocket === WAY_BACK,
      "every connection back on WebSocket",
    );
    await sleep(1_000);
    const { last } = await publisher.ask("stop");
    const seen = await clients.awaitEvent(last);
    return {
      connections: WAY_BACK,
      allBackMs: (back - begun) / 1000,
      events: last,
      ...tallied(seen),
    };
  } finally {
    await clients.close();
    await entry.close();
    for (const replica of replicas) replica.kill();
  }
}

/* The events the connections missed, never had, or had twice, and how many opened again without
   resuming; with the first gaps when any was missed. */
function tallied(seen) {
  return {
    missed: seen.missed,
    short: seen.short,
    twice: seen.twice,
    brokenOff: seen.brokenOff,
    ...(seen.missed > 0 && { gaps: seen.gaps.slice(0, 10) }),
  };
}

async function measure() {
  const redis = env.REDIS_URL;
  if (!redis) throw new Error("No Redis: REDIS_URL names the one the probe writes to");
  /* Its own keys and channels, so a run neither reads nor leaves what another's did. */
  const prefix = `courier-scale-${pid}-${Date.now()}:`;
  return {
    forwarding: await measureForwarding(redis, prefix),
    storm: await measureStorm(redis, `${prefix}storm:`),
    wayBack: await measureWayBack(redis, `${prefix}way-back:`),
  };
}

const seen = await measure().catch((error) => ({
  failed: error instanceof Error ? error.message : String(error),
}));
/* Out once the line is written: the children of a step that failed would hold the probe open. */
stdout.write(`${JSON.stringify(seen)}\n`, () => exit(seen.failed === undefined ? 0 : 1));
