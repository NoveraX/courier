/**
 * How long a broadcast takes to reach every subscriber, on each transport,
 * timed apart from the processor time the probe reads at a steady pace:
 * rounds of one broadcast on each transport in turn, each sent once the last
 * on every transport is in every client's hands and every connection over
 * HTTP holds its stream or poll again. A broadcast then meets each
 * connection ready, as one that is not the next of a burst does; what is
 * timed is that broadcast, not the queue behind the one before it, which a
 * machine slow enough to fall behind the steady pace would otherwise add.
 */
import { setTimeout as sleep } from "node:timers/promises";

/* How long a replica may take to hold every connection's stream or poll again after a broadcast. */
const HELD_MS = 30_000;
/* How often the replica is asked meanwhile. */
const ASK_EVERY_MS = 2;

/**
 * Time `rounds` broadcasts on each transport: in turn, each sent once the
 * last on every transport is in every client's hands and, over HTTP, every
 * connection holds its stream or poll again.
 *
 * @param {FanoutRun[]} runs - Each transport's replica, its clients, and the last event broadcast on it, which each broadcast here counts on from
 * @param {{ rounds: number, connections: number, heldMs?: number }} plan - The broadcasts on each transport, the connections each has, and how long a replica may take to hold every one's request again
 * @returns {Promise<Map<string, { latencies: number[], last: object }>>} Each transport's latencies, in µs from a broadcast's start to a client's hands, and what its clients had once the last was in every one's
 * @throws {Error} When a broadcast does not reach every client, or a replica does not hold every connection's stream or poll again in time
 * @example
 * ```js
 * const reached = await timeFanout(opened, { rounds: 20, connections: 2_000 });
 * percentiles(reached.get("poll").latencies.map((us) => us / 1000)).p99;
 * ```
 */
export async function timeFanout(runs, { rounds, connections, heldMs = HELD_MS }) {
  const reached = new Map();
  for (const run of runs) {
    reached.set(run.transport, { latencies: [], last: await settled(run, connections, heldMs) });
  }
  for (let round = 0; round < rounds; round++) {
    for (const run of runs) {
      await run.replica.ask("broadcast", { n: ++run.n, timed: true });
      const heard = await settled(run, connections, heldMs);
      const each = reached.get(run.transport);
      each.latencies.push(...heard.latencies);
      each.last = heard;
    }
  }
  return reached;
}

/* Once every client has the transport's last broadcast and, over HTTP, its replica holds every
   connection's stream or poll again: what the clients had. */
async function settled(run, connections, heldMs) {
  const heard = await run.clients.awaitEvent(run.n);
  if (heard.short > 0) {
    throw new Error(
      `${heard.short} of ${connections} connections on ${run.transport} never had event ${run.n}`,
    );
  }
  if (run.transport !== "websocket") await held(run, connections, heldMs);
  return heard;
}

async function held(run, connections, heldMs) {
  const deadline = performance.now() + heldMs;
  for (;;) {
    const { stats } = await run.replica.ask("stats");
    const holding = stats.http.streaming + stats.http.polling;
    if (holding >= connections) return;
    if (performance.now() >= deadline) {
      throw new Error(
        `${holding} of ${connections} connections on ${run.transport} held a stream or a poll ${heldMs / 1000} s after event ${run.n}`,
      );
    }
    await sleep(ASK_EVERY_MS);
  }
}

/**
 * @typedef {object} FanoutRun A transport the probe opened
 * @property {string} transport - `websocket`, `stream` or `poll`
 * @property {{ ask: (kind: string, fields?: object) => Promise<any> }} replica - Its replica
 * @property {{ awaitEvent: (n: number) => Promise<any> }} clients - Its clients
 * @property {number} n - The last event broadcast on it
 */
