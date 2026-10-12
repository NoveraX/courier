/**
 * Load for an HTTP server: a pool of kept-alive connections, each sending
 * one request after another until the count is reached, every request
 * timed from its start to the last byte of its answer.
 */
import { createRequire } from "node:module";

import { percentiles } from "./metrics.mjs";

const require = createRequire(import.meta.url);

/** @typedef {{ origin: string, path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: string }} Request */

/**
 * Send requests at a concurrency and time them.
 *
 * @param {(index: number) => Request} next - The request to send at each index
 * @param {{ requests: number, connections: number }} options - How many requests, over how many connections
 * @returns {Promise<{ rps: number, p50: number, p95: number, p99: number, max: number, failed: number, statuses: Record<number, number> }>} Requests a second and latencies in ms
 * @example
 * ```js
 * await load((i) => ({ origin, path: "/projects", method: "GET" }), { requests: 10_000, connections: 32 });
 * ```
 */
export async function load(next, { requests, connections }) {
  const { Pool } = require("undici");
  const pools = new Map();
  const pool = (origin) => {
    if (!pools.has(origin)) pools.set(origin, new Pool(origin, { connections, pipelining: 1 }));
    return pools.get(origin);
  };
  const samples = [];
  const statuses = {};
  let failed = 0;
  let issued = 0;
  const started = performance.now();
  const lane = async () => {
    while (issued < requests) {
      const request = next(issued++);
      const begun = performance.now();
      try {
        const { statusCode, body } = await pool(request.origin).request({
          path: request.path,
          method: request.method,
          ...(request.body !== undefined && {
            body: request.body,
            headers: { "content-type": "application/json" },
          }),
        });
        await body.dump();
        statuses[statusCode] = (statuses[statusCode] ?? 0) + 1;
        if (statusCode >= 500) failed++;
      } catch {
        /* A request the server dropped counts as failed; the load goes on. */
        failed++;
      }
      samples.push(performance.now() - begun);
    }
  };
  await Promise.all(Array.from({ length: connections }, lane));
  const seconds = (performance.now() - started) / 1000;
  await Promise.all([...pools.values()].map((each) => each.close()));
  const { p50, p95, p99, max } = percentiles(samples);
  return { rps: samples.length / seconds, p50, p95, p99, max, failed, statuses };
}
