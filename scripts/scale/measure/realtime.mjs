/**
 * What Courier's WebSocket handler costs a large deployment: admitting ten
 * thousand connections and the heap each holds, subscribing them all to one
 * topic and fanning a broadcast out to it, closing one user's connections
 * among them, a signed command reaching another replica, a limit on each
 * user's connections, and stopping — the network left out.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { measured } from "./metrics.mjs";

/** Connections the handler is measured with. */
const CONNECTIONS = 10_000;
/** How long the probe may run in all: longer than any of its steps, each of which has its own deadline. */
const PROBE_MS = 300_000;

/**
 * Measure the WebSocket handler's own cost.
 *
 * @param {{ repo: string }} fixture - The repository, whose built core is measured
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @throws {Error} Why the probe gave no figures: the step it gave up on, or the time it ran out of
 * @example
 * ```js
 * await measureRealtime({ repo });
 * ```
 */
export async function measureRealtime({ repo }) {
  const seen = probe(repo);
  const of = `${seen.connections} connections`;
  return [
    measured("realtime.admit", seen.admitMs, "ms", 3_000, { note: `${of}, onConnect each` }),
    measured("realtime.heapPerConnection", seen.heapPerConnectionKb, "KB", 40),
    measured("realtime.subscribe", seen.subscribeMs, "ms", 3_000, { note: `${of} to one topic` }),
    measured("realtime.broadcast.p99", seen.broadcast.p99, "ms", 250, {
      note: `to ${of}; every one delivered: ${seen.delivered}`,
    }),
    measured("realtime.broadcast.delivered", seen.delivered ? 1 : 0, "", 1, { more: true }),
    measured("realtime.disconnectByMeta.p99", seen.disconnectByMeta.p99, "µs", 20_000, {
      note: `one user's 5 among ${of}`,
    }),
    measured("realtime.clusterCommand.p99", seen.command.p99, "ms", 50, {
      note: "signed, 3 replicas on one bus, until the socket is closed",
    }),
    measured("realtime.limit.perConnection", seen.limitOverheadUs, "µs", 300, {
      note: "maxConnectionsPerKey 3 of 5 a user, evictions included",
    }),
    measured("realtime.destroy", seen.destroyMs, "ms", 2_000, { note: of }),
  ];
}

/* What the probe saw: its last line, which names the step it gave up on when it saw nothing. */
function probe(repo) {
  let out;
  try {
    out = execFileSync(
      process.execPath,
      ["--expose-gc", join(import.meta.dirname, "realtime-probe.mjs"), String(CONNECTIONS)],
      { cwd: repo, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: PROBE_MS },
    );
  } catch (error) {
    if (error.code === "ETIMEDOUT") {
      throw new Error(`The realtime probe was stopped after ${PROBE_MS / 1000} s`);
    }
    out = error.stdout ?? "";
  }
  const seen = lastLine(out);
  if (typeof seen?.failed === "string") throw new Error(seen.failed);
  if (seen?.broadcast === undefined) {
    throw new Error("The realtime probe ended with no figures: what it wrote is above");
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
