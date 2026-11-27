/**
 * Run inside a fresh Node: what each transport costs a replica, side by
 * side — WebSocket, an HTTP stream, polls — its connections opened by
 * Courier's own client in processes of their own, so what is read off the
 * replica's process is the replica's alone. The three are open at once,
 * each on a replica of its own. For each: the heap a connection holds; the
 * processor time of each message delivered, the three broadcast to at the
 * same pace and timed over the same windows; and how long a broadcast takes
 * to reach each subscriber, from its start to the client's hands, timed
 * apart in rounds of one broadcast on each transport, each sent once the
 * last is in every client's hands and every request over HTTP is held again
 * (`transports-fanout.mjs`), so what is timed is a broadcast's, not a
 * queue's, on any machine. Prints what it saw, as JSON, or `{ failed }` with
 * why it saw nothing, and exits with 1.
 *
 *   node transports-probe.mjs [connections]
 */
import { availableParallelism } from "node:os";
import { argv, exit, stdout } from "node:process";
import { setTimeout as sleep } from "node:timers/promises";

import { percentiles } from "./metrics.mjs";
import { timeFanout } from "./transports-fanout.mjs";
import { startClients, startReplica } from "./transports-processes.mjs";

const [connectionsArg = "2000"] = argv.slice(2);
const CONNECTIONS = Number(connectionsArg);
/* Each transport's clients' processes: as many as the machine runs beside a replica, so that what
   a client takes to read its messages is not what holds the next one up. */
const PROCESSES = Math.max(2, Math.min(8, availableParallelism() - 2));
/* Rounds before the timed ones, at the pace of the timed ones: the first calls' compiling behind
   them, and each replica as busy as it is timed. */
const WARM_ROUNDS = 20;
/* Each window's rounds, every replica broadcast to once a round, and the windows timed. */
const ROUNDS = 20;
const WINDOWS = 3;
const GAP_MS = 250;
/* After the last broadcast is in every client's hands, for what it set off — the polls asked
   again — to be done before the processor time is read. */
const SETTLE_MS = 300;
/* The rounds a broadcast's reach is timed over, one broadcast on each transport a round. */
const FANOUT_ROUNDS = 20;

const TRANSPORTS = ["websocket", "stream", "poll"];

/*
 * A transport's replica, its connections all subscribed, and the heap they hold; kept in
 * `opened` from its start, so whatever fails on the way is closed with the rest. A
 * replica of an HTTP transport refuses upgrades, as the entry it stands for would; that entry
 * would also refuse, before any replica heard of them, the probes each connection over HTTP
 * makes for a WebSocket getting through again, 15 to 30 s after it opens, so its clients refuse
 * those themselves, and what the replica is measured for is the messages it delivers.
 */
async function open(transport, opened) {
  const replica = await startReplica({ upgrades: transport === "websocket" });
  const run = { transport, replica, clients: undefined, heapPerConnectionKb: 0, n: 0 };
  opened.push(run);
  const { bytes: idle } = await replica.ask("heap");
  run.clients = startClients(replica.url, transport, CONNECTIONS, PROCESSES, {
    webSocketRefused: transport !== "websocket",
  });
  await run.clients.when(
    ({ subscribed }) => subscribed === CONNECTIONS,
    `${CONNECTIONS} connections subscribed on ${transport}`,
  );
  const { bytes: held } = await replica.ask("heap");
  run.heapPerConnectionKb = (held - idle) / CONNECTIONS / 1024;
}

/*
 * The transports side by side, each on a replica of its own, all three open at once and busy at
 * the same pace: each round broadcasts on each, a third of the gap after the last, so each
 * replica's broadcasts are the gap apart and no two begin together; and each window reads every
 * replica's processor time over the same rounds. A message's processor time is the median of a
 * transport's windows, and how it stands to WebSocket's the median of what it was in each window.
 * Whatever the machine does meanwhile — the cores it gives them, their clocks, another process's
 * load — it does to all three alike; and none waits idle for a turn, which a replica in service
 * does not either, and after which the machine runs it slower for a while: an HTTP stream timed
 * after ten seconds of waiting cost up to twice as much a message, in the kernel's time for the
 * same writes as in its own. Then a broadcast's reach, timed apart: at the steady pace, a machine
 * too slow for it delivers each broadcast behind the queue of the one before.
 */
async function measure() {
  const seen = {
    connections: CONNECTIONS,
    rounds: ROUNDS,
    windows: WINDOWS,
    fanoutRounds: FANOUT_ROUNDS,
    clientProcesses: PROCESSES,
  };
  const opened = [];
  try {
    for (const transport of TRANSPORTS) await open(transport, opened);
    await broadcastRounds(opened, WARM_ROUNDS);
    await Promise.all(opened.map(({ clients, n }) => clients.awaitEvent(n)));
    const windows = [];
    for (let window = 0; window < WINDOWS; window++) windows.push(await timedWindow(opened));
    const reached = await timeFanout(opened, { rounds: FANOUT_ROUNDS, connections: CONNECTIONS });
    for (const [index, run] of opened.entries()) {
      const { latencies, last } = reached.get(run.transport);
      seen[run.transport] = {
        heapPerConnectionKb: run.heapPerConnectionKb,
        cpuPerMessageUs: median(windows.map((each) => each[index])),
        fanout: percentiles(latencies.map((us) => us / 1000)),
        delivered: last.short === 0 && last.missed === 0 && last.twice === 0,
        carried: carriedOf(last.transports),
      };
    }
    const ofWebSocket = (transport) => {
      const at = TRANSPORTS.indexOf(transport);
      return median(windows.map((each) => each[at] / each[0]));
    };
    seen.streamOfWebSocket = ofWebSocket("stream");
    seen.pollOfWebSocket = ofWebSocket("poll");
    return seen;
  } finally {
    await Promise.all(opened.map(({ clients }) => clients?.close()));
    for (const { replica } of opened) replica.kill();
  }
}

/* Rounds of broadcasts: each round one on each replica, a third of the gap after the last. */
async function broadcastRounds(opened, rounds) {
  const sent = [];
  for (let round = 0; round < rounds; round++) {
    for (const run of opened) {
      sent.push(run.replica.ask("broadcast", { n: ++run.n }));
      await sleep(GAP_MS / opened.length);
    }
  }
  await Promise.all(sent);
}

/* A window of rounds, timed on every replica alike: the processor time of each message it
   delivered, read once the last broadcast was in every client's hands. */
async function timedWindow(opened) {
  const begun = await Promise.all(opened.map(({ replica }) => replica.ask("cpu")));
  await broadcastRounds(opened, ROUNDS);
  await Promise.all(opened.map(({ clients, n }) => clients.awaitEvent(n)));
  await sleep(SETTLE_MS);
  const ended = await Promise.all(opened.map(({ replica }) => replica.ask("cpu")));
  return opened.map((_run, index) => (ended[index].us - begun[index].us) / (CONNECTIONS * ROUNDS));
}

const median = (values) => percentiles(values).p50;

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

const seen = await measure().catch((error) => ({
  failed: error instanceof Error ? error.message : String(error),
}));
/* Out once the line is written: the children of a step that failed would hold the probe open. */
stdout.write(`${JSON.stringify(seen)}\n`, () => exit(seen.failed === undefined ? 0 : 1));
