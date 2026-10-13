/**
 * The floor the mocks are held to: the same requests, sent the same way,
 * answered by a bare Node server for each API on the same machine — what
 * it takes them and what processor time they use.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

import { load } from "./load.mjs";
import { cpuSeconds } from "./metrics.mjs";

/**
 * Start a bare server for each API, send the requests, and stop them.
 *
 * @param {{ apis: number, endpoints: number, base: number }} servers - How many APIs, the project's size, and the first server's port
 * @param {readonly import("./load.mjs").Request[]} requests - The requests, addressed to the servers' ports, sent in turn until the count
 * @param {{ requests: number, connections: number }} options - How many requests, over how many connections
 * @returns {Promise<Awaited<ReturnType<typeof load>> & { cpu: number }>} What the load saw, and the servers' processor time a request, in ms
 * @example
 * ```js
 * const bare = await bareLoad({ apis: 5, endpoints: 1000, base: 7420 }, requests, { requests: 20_000, connections: 32 });
 * ```
 */
export async function bareLoad({ apis, endpoints, base }, requests, options) {
  const servers = Array.from({ length: apis }, (_, at) =>
    spawn(
      process.execPath,
      [
        join(import.meta.dirname, "bare-mock.mjs"),
        String(endpoints),
        String(at),
        String(base + at),
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    ),
  );
  try {
    await Promise.all(servers.map(listening));
    const pids = servers.map((server) => server.pid ?? 0);
    const before = cpuSeconds(pids);
    const seen = await load((index) => requests[index % requests.length] ?? requests[0], options);
    return { ...seen, cpu: ((cpuSeconds(pids) - before) * 1000) / options.requests };
  } finally {
    for (const server of servers) server.kill();
  }
}

function listening(child) {
  return new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("exit", (code) =>
      reject(new Error(`a bare server stopped (${code}) before listening`)),
    );
  });
}
