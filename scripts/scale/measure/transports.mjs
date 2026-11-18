/**
 * What each transport of the WebSocket handler costs a replica, side by
 * side — WebSocket, an HTTP stream, polls — its clients Courier's own, in
 * processes of their own; and what replicas with no affinity cost each
 * other over HTTP, on Redis with the topic log: a request sent on to the
 * replica that holds its connection; a reconnect storm, a replica drained,
 * then killed, under thousands of connections behind an entry that deals
 * requests out in turn and refuses upgrades; and the way back to WebSocket
 * once the entry lets upgrades through.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { env } from "node:process";

import { measured } from "./metrics.mjs";

/** Connections each transport is measured with. */
const CONNECTIONS = 2_000;
/** Connections of the storm, a third of them on the replica drained. */
const STORM = 6_000;
/** How long a probe may run in all: longer than any of its steps, each of which has its own deadline. */
const PROBE_MS = 600_000;
/* The most a transport's connection may hold of the replica's heap, the processor time of each
   message it is delivered, and how long a broadcast may take to reach every one, at its p99. */
const BUDGETS = {
  websocket: { heapKb: 40, cpuUs: 40, fanoutMs: 150 },
  stream: { heapKb: 60, cpuUs: 80, fanoutMs: 200 },
  poll: { heapKb: 60, cpuUs: 400, fanoutMs: 500 },
};

/**
 * Measure each transport's cost to a replica.
 *
 * @param {{ repo: string }} fixture - The repository, whose built packages are measured
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @throws {Error} Why the probe gave no figures: the step it gave up on, or the time it ran out of
 * @example
 * ```js
 * await measureTransports({ repo });
 * ```
 */
export async function measureTransports({ repo }) {
  const seen = probe(repo, "transports-probe.mjs", CONNECTIONS, (figures) => figures.poll);
  const of = `${seen.connections} connections, ${seen.clientProcesses} client processes, the median of ${seen.windows} windows`;
  const figures = [];
  for (const transport of ["websocket", "stream", "poll"]) {
    const each = seen[transport];
    const budget = BUDGETS[transport];
    figures.push(
      measured(
        `transports.${transport}.heapPerConnection`,
        each.heapPerConnectionKb,
        "KB",
        budget.heapKb,
      ),
      measured(`transports.${transport}.cpuPerMessage`, each.cpuPerMessageUs, "µs", budget.cpuUs, {
        note: of,
      }),
      measured(`transports.${transport}.fanout.p50`, each.fanout.p50, "ms", budget.fanoutMs),
      measured(`transports.${transport}.fanout.p99`, each.fanout.p99, "ms", budget.fanoutMs, {
        note: `every one delivered once, in order: ${each.delivered}`,
      }),
      measured(`transports.${transport}.delivered`, each.delivered ? 1 : 0, "", 1, { more: true }),
    );
  }
  /* Each against WebSocket's over the same window: the median of the windows' own. */
  const ofWindows = `the median of ${seen.windows} windows' own, the three timed over each`;
  figures.push(
    measured("transports.stream.cpuOfWebSocket", seen.streamOfWebSocket, "×", 2.5, {
      note: ofWindows,
    }),
    measured("transports.poll.cpuOfWebSocket", seen.pollOfWebSocket, "×", 12, {
      note: `${ofWindows}; an answer ended and a request read for every message`,
    }),
  );
  return figures;
}

/**
 * Measure what replicas with no affinity cost each other over HTTP.
 *
 * @param {{ repo: string }} fixture - The repository, whose built packages are measured
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @throws {Error} With no Redis named by `REDIS_URL`, or why the probe gave no figures
 * @example
 * ```js
 * await measureReplicas({ repo });
 * ```
 */
export async function measureReplicas({ repo }) {
  if (!env.REDIS_URL) throw new Error("No Redis: REDIS_URL names the one the replicas share");
  const { forwarding, storm, wayBack } = probe(
    repo,
    "transports-cluster-probe.mjs",
    STORM,
    (figures) => figures.wayBack,
  );
  const overhead = forwarding.forwarded.p99 - forwarding.direct.p99;
  return [
    measured("replicas.forwarded.overhead.p99", overhead, "ms", 10, {
      note: `${forwarding.forwarded.p99.toFixed(2)} ms sent on, ${forwarding.direct.p99.toFixed(2)} ms at the owner`,
    }),
    measured("replicas.forwarded.perSecond", forwarding.perSecond, "req/s", 1_000, {
      more: true,
      note: "sent on by one replica, 64 in flight",
    }),
    measured("replicas.storm.mostBack", storm.mostBackMs / 1000, "s", 20, {
      note: `99 % of ${storm.connections} subscribed again, ${storm.drainedHeld} drained`,
    }),
    measured(
      "replicas.storm.allBack",
      (storm.allBackMs ?? Number.POSITIVE_INFINITY) / 1000,
      "s",
      60,
      {
        ...(storm.stuck && { note: `not back: ${JSON.stringify(storm.stuck).slice(0, 300)}` }),
      },
    ),
    ...delivery("replicas.storm", storm),
    measured("replicas.wayBack.allBack", wayBack.allBackMs / 1000, "s", 60, {
      note: `${wayBack.connections} connections; each probes within 30 s of falling back`,
    }),
    ...delivery("replicas.wayBack", wayBack),
  ];
}

/* What the connections of a run had of its broadcasts: none lost, none twice, every one resumed. */
function delivery(name, run) {
  const lost = run.missed + run.short;
  return [
    measured(`${name}.lost`, lost, "events", 0, {
      note:
        lost > 0 ? JSON.stringify(run.gaps).slice(0, 300) : `of ${run.events} broadcast to each`,
    }),
    measured(`${name}.twice`, run.twice, "events", 0),
    measured(`${name}.brokenOff`, run.brokenOff, "", 0, {
      note: "subscriptions back that did not resume",
    }),
  ];
}

/* What a probe saw: its last line, which names the step it gave up on when it saw nothing. */
function probe(repo, script, connections, complete) {
  let out;
  try {
    out = execFileSync(process.execPath, [join(import.meta.dirname, script), String(connections)], {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: PROBE_MS,
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (error) {
    if (error.code === "ETIMEDOUT") {
      throw new Error(`The probe ${script} was stopped after ${PROBE_MS / 1000} s`);
    }
    out = error.stdout ?? "";
  }
  const seen = lastLine(out);
  if (typeof seen?.failed === "string") throw new Error(seen.failed);
  if (complete(seen ?? {}) === undefined) {
    throw new Error(`The probe ${script} ended with no figures: what it wrote is above`);
  }
  return seen;
}

function lastLine(out) {
  try {
    return JSON.parse(out.trim().split("\n").at(-1) ?? "");
  } catch {
    return undefined;
  }
}
