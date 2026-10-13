/**
 * What Courier costs a large project at run time: importing every API it
 * defines, the memory they hold, and each call's own time — the network
 * left out — against fetching and parsing the same answer by hand.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { bundleEntry } from "./bundle.mjs";
import { measured } from "./metrics.mjs";

/**
 * Measure the project's runtime cost.
 *
 * @param {{ dir: string, endpoints: number }} fixture - The project
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureRuntime({ dir, endpoints: 1000 });
 * ```
 */
export async function measureRuntime({ dir, endpoints }) {
  const bundle = await bundleEntry(dir, "src/courier/callers.ts", "callers");
  const out = execFileSync(
    process.execPath,
    [
      "--expose-gc",
      join(import.meta.dirname, "runtime-probe.mjs"),
      bundle,
      String(endpoints),
      "20000",
    ],
    { cwd: dir, encoding: "utf8" },
  );
  const seen = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
  return [
    measured("runtime.import", seen.importMs, "ms", 1_000, {
      note: `${endpoints} endpoints defined, callers made`,
    }),
    measured("runtime.heap", seen.heapMb, "MB", 80),
    /* Twice what the slowest CI runner takes: a first call is the machine's speed and Courier's alone. */
    measured("runtime.firstCall", seen.firstCallMs, "ms", 120),
    measured("runtime.call.p50", seen.courier.p50, "µs", 1_000, {
      note: `bare fetch+json ${Math.round(seen.bare.p50)} µs`,
    }),
    measured("runtime.call.p99", seen.courier.p99, "µs", 5_000, {
      note: `bare ${Math.round(seen.bare.p99)} µs`,
    }),
  ];
}
