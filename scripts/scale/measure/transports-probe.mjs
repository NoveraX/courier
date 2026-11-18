/**
 * Run inside a fresh Node: what each transport costs a replica, side by
 * side — WebSocket, an HTTP stream, polls — its connections opened by
 * Courier's own client in processes of their own, so what is read off the
 * replica's process is the replica's alone. For each: the heap a
 * connection holds, the processor time of each message delivered, and how
 * long a broadcast takes to reach each subscriber, from its start to the
 * client's hands. Each broadcast waits a gap after the last, so what is
 * timed is a broadcast's, not a queue's. Prints what it saw, as JSON, or
 * `{ failed }` with why it saw nothing, and exits with 1.
 *
 *   node transports-probe.mjs [connections]
 */
import { availableParallelism } from "node:os";
import { argv, exit, stdout } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { percentiles } from "./metrics.mjs";
import { startClients, startReplica } from "./transports-processes.mjs";

const [connectionsArg = "2000"] = argv.slice(2);
const CONNECTIONS = Number(connectionsArg);
/* The clients' processes: as many as the machine runs beside the replica, so that what a client
   takes to read its messages is not what holds the next one up. */
const PROCESSES = Math.max(2, Math.min(8, availableParallelism() - 2));
/* Broadcasts before the timed ones, so the first calls' compiling is not what is timed. */
const WARM = 5;
const ROUNDS = 20;
const GAP_MS = 250;
/* After the last broadcast is in every client's hands, for what it set off — the polls asked
   again — to be done before the processor time is read. */
const SETTLE_MS = 300;

async function measureTransport(transport) {
  const replica = await startReplica({ upgrades: transport === "websocket" });
  try {
    const { bytes: idle } = await replica.ask("heap");
    const clients = startClients(replica.url, transport, CONNECTIONS, PROCESSES);
    try {
      await clients.when(
        ({ subscribed }) => subscribed === CONNECTIONS,
        `${CONNECTIONS} connections subscribed on ${transport}`,
      );
      const { bytes: held } = await replica.ask("heap");
      let n = 0;
      while (n < WARM) await replica.ask("broadcast", { n: ++n });
      await clients.awaitEvent(n);
      const { us: begun } = await replica.ask("cpu");
      for (let round = 0; round < ROUNDS; round++) {
        await replica.ask("broadcast", { n: ++n, timed: true });
        await sleep(GAP_MS);
      }
      const seen = await clients.awaitEvent(n);
      await sleep(SETTLE_MS);
      const { us: ended } = await replica.ask("cpu");
      return {
        heapPerConnectionKb: (held - idle) / CONNECTIONS / 1024,
        cpuPerMessageUs: (ended - begun) / (CONNECTIONS * ROUNDS),
        fanout: percentiles(seen.latencies.map((us) => us / 1000)),
        delivered: seen.short === 0 && seen.missed === 0 && seen.twice === 0,
        carried: carriedOf(seen.transports),
      };
    } finally {
      await clients.close();
    }
  } finally {
    replica.kill();
  }
}

/* The connections each transport carried at the end, every client process's together. */
function carriedOf(counts) {
  const carried = {};
  for (const each of counts) {
    for (const [transport, count] of Object.entries(each)) {
      carried[transport] = (carried[transport] ?? 0) + count;
    }
  }
  return carried;
}

async function measure() {
  const seen = { connections: CONNECTIONS, rounds: ROUNDS, clientProcesses: PROCESSES };
  for (const transport of ["websocket", "stream", "poll"]) {
    seen[transport] = await measureTransport(transport);
  }
  return seen;
}

const seen = await measure().catch((error) => ({
  failed: error instanceof Error ? error.message : String(error),
}));
/* Out once the line is written: the children of a step that failed would hold the probe open. */
stdout.write(`${JSON.stringify(seen)}\n`, () => exit(seen.failed === undefined ? 0 : 1));
