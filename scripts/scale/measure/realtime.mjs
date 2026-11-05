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

/**
 * Measure the WebSocket handler's own cost.
 *
 * @param {{ repo: string }} fixture - The repository, whose built core is measured
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureRealtime({ repo });
 * ```
 */
export async function measureRealtime({ repo }) {
  const out = execFileSync(
    process.execPath,
    ["--expose-gc", join(import.meta.dirname, "realtime-probe.mjs"), String(CONNECTIONS)],
    { cwd: repo, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  const seen = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
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
