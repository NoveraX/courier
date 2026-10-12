/**
 * The app's own server in front of the enterprise project's APIs — Courier's
 * proxy, the boundaries checked — under the calls its pages make, against
 * the same calls made straight to the backend; with Studio recording or not.
 */
import { execFile, execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

import { bundleEntry } from "./bundle.mjs";
import { measured } from "./metrics.mjs";

const run = promisify(execFile);

/**
 * Start the app's server, call through it, and stop it.
 *
 * @param {{ dir: string, endpoints: number, ports: { app: number }, label: string, attach: boolean }} fixture - The project, and whether the server attaches to a running Studio
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureProxy({ dir, endpoints: 1000, ports, label: "proxy", attach: false });
 * ```
 */
export async function measureProxy({ dir, endpoints, ports, label, attach }) {
  const server = await bundleEntry(dir, "src/server/main.ts", "server");
  const storefront = await bundleEntry(dir, "src/courier/storefront.ts", "storefront");
  const callers = await bundleEntry(dir, "src/courier/callers.ts", "callers");
  const app = spawn(process.execPath, [server], {
    cwd: dir,
    stdio: "ignore",
    env: { ...process.env, ATTACH_STUDIO: attach ? "1" : "0" },
  });
  try {
    await waitFor(`http://127.0.0.1:${ports.app}/`);
    const out = execFileSync(
      process.execPath,
      [
        join(import.meta.dirname, "proxy-probe.mjs"),
        storefront,
        callers,
        String(endpoints),
        "10000",
        "32",
      ],
      { cwd: dir, encoding: "utf8" },
    );
    const seen = JSON.parse(out.trim().split("\n").at(-1) ?? "{}");
    const overhead = seen.proxied.p50 - seen.direct.p50;
    /* Sized for a CI runner, a third of what a laptop does: a guard against a regression, not a target. */
    return [
      measured(`${label}.rps`, seen.proxied.rps, "call/s", attach ? 1_000 : 1_500, {
        more: true,
        note: `through the app's server, 32 at a time; direct ${Math.round(seen.direct.rps)}`,
      }),
      measured(`${label}.p50`, seen.proxied.p50, "ms", attach ? 20 : 15, {
        note: `direct ${seen.direct.p50.toFixed(2)} ms, proxy adds ${overhead.toFixed(2)} ms`,
      }),
      measured(`${label}.p99`, seen.proxied.p99, "ms", 60, {
        note: `direct ${seen.direct.p99.toFixed(2)} ms`,
      }),
      measured(`${label}.failed`, seen.proxied.failed + seen.direct.failed, "call", 0),
    ];
  } finally {
    app.kill("SIGINT");
    await sleep(500);
  }
}

/**
 * The app's server attached to the running Studio, and the traffic its
 * pages make through it: for what is measured while it flows.
 *
 * @param {{ dir: string, endpoints: number, ports: { app: number } }} fixture - The project
 * @returns {Promise<{ traffic: (calls: number) => Promise<void>, stop: () => Promise<void> }>} The app, running
 * @example
 * ```js
 * const app = await attachedApp(fixture);
 * await app.traffic(3000);
 * await app.stop();
 * ```
 */
export async function attachedApp({ dir, endpoints, ports }) {
  const server = await bundleEntry(dir, "src/server/main.ts", "server");
  const storefront = await bundleEntry(dir, "src/courier/storefront.ts", "storefront");
  const callers = await bundleEntry(dir, "src/courier/callers.ts", "callers");
  const app = spawn(process.execPath, [server], {
    cwd: dir,
    stdio: "ignore",
    env: { ...process.env, ATTACH_STUDIO: "1" },
  });
  await waitFor(`http://127.0.0.1:${ports.app}/`);
  return {
    traffic: async (calls) => {
      await run(
        process.execPath,
        [
          join(import.meta.dirname, "proxy-probe.mjs"),
          storefront,
          callers,
          String(endpoints),
          String(calls),
          "8",
        ],
        { cwd: dir },
      );
    },
    stop: async () => {
      app.kill("SIGINT");
      await new Promise((resolve) =>
        app.exitCode === null ? app.once("exit", resolve) : resolve(),
      );
    },
  };
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(500) });
      return;
    } catch {
      /* Not listening yet. */
      await sleep(100);
    }
  }
  throw new Error(`the app's server did not answer at ${url}`);
}
