/**
 * Studio on the enterprise project: how long it takes to answer and to have
 * every mock up, what it and its mocks hold in memory, what it costs the
 * processor while nothing happens, and how fast it answers what the editor
 * asks — the figures of every endpoint, the calls in a file, the
 * declarations. Studio's own output goes to a file that is never printed:
 * it names Studio's token.
 */
import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { editorFigures } from "./editor.mjs";
import { cpuSeconds, measured, residentMb, treeOf } from "./metrics.mjs";

const IDLE_SECONDS = 20;
/* What Studio and its mocks hold once their start is over: V8 gives back what loading took a few seconds later. */
const SETTLE_SECONDS = 15;

/**
 * Start Studio for the project, measure it, and stop it.
 *
 * @param {{ dir: string, repo: string, ports: { studio: number, mocks: number }, sources: number }} fixture - The project
 * @param {(studio: { url: string, pid: number }) => Promise<import("./metrics.mjs").Measured[]>} [more] - What else to measure while it runs
 * @returns {Promise<import("./metrics.mjs").Measured[]>} The figures
 * @example
 * ```js
 * await measureStudio({ dir, repo, ports, sources: 5 });
 * ```
 */
export async function measureStudio(fixture, more) {
  const { dir, repo, ports } = fixture;
  const url = `http://127.0.0.1:${ports.studio}`;
  mkdirSync(join(dir, ".scale"), { recursive: true });
  const log = openSync(join(dir, ".scale", "studio.log"), "w");
  const started = performance.now();
  const studio = spawn(
    process.execPath,
    [
      join(repo, "packages/studio/lib/cli.js"),
      "--cwd",
      dir,
      "--port",
      String(ports.studio),
      "--host",
      "127.0.0.1",
      "--no-open",
    ],
    {
      stdio: ["ignore", log, log],
      env: { ...process.env, COURIER_LOG_FORMAT: "json" },
    },
  );
  try {
    let peak = 0;
    const sample = () => {
      peak = Math.max(peak, residentMb(treeOf(studio.pid ?? 0)));
    };
    await until(() => answers(`${url}/api/health`), 120_000);
    const readyMs = performance.now() - started;
    const mockPorts = Array.from({ length: fixture.sources }, (_, at) => ports.mocks + at);
    await until(async () => {
      sample();
      return (await Promise.all(mockPorts.map(listening))).every(Boolean);
    }, 120_000);
    const mocksMs = performance.now() - started;
    for (let second = 0; second < SETTLE_SECONDS; second++) {
      sample();
      await sleep(1_000);
    }
    const tree = treeOf(studio.pid ?? 0);
    const memory = residentMb(tree);
    const before = cpuSeconds(tree);
    await sleep(IDLE_SECONDS * 1000);
    const idle = ((cpuSeconds(tree) - before) / IDLE_SECONDS) * 100;
    const editor = await editorFigures(url, dir, "studio.editor");
    /* Studio's start and its processor at rest follow the machine's speed,
       and nothing does their work without Courier to hold them to: their
       budgets are twice what the slowest CI runner takes. */
    return [
      measured("studio.ready", readyMs, "ms", 8_000, { note: "start to /api/health" }),
      measured("studio.mocksReady", mocksMs, "ms", 15_000, {
        note: `${mockPorts.length} mocks listening`,
      }),
      measured("studio.startPeak", peak, "MB", 2_500, {
        note: "Studio and its mocks while they start",
      }),
      measured("studio.memory", memory, "MB", 1_200, {
        note: `${tree.length} processes at rest, ${SETTLE_SECONDS} s after the mocks started`,
      }),
      measured("studio.idleCpu", idle, "%", 5, { note: `of one core, over ${IDLE_SECONDS} s` }),
      ...editor,
      ...(more ? await more({ url, pid: studio.pid ?? 0 }) : []),
    ];
  } finally {
    await stop(studio);
  }
}

async function answers(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    /* Not listening yet. */
    return false;
  }
}

function listening(port) {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1", () => resolve(socket.end() && true));
    socket.on("error", () => resolve(false));
  });
}

async function until(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(100);
  }
  throw new Error(
    `Studio did not get there within ${timeoutMs / 1000} s; its log is in the project's .scale/studio.log`,
  );
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGINT");
  const exited = new Promise((resolve) => child.once("exit", resolve));
  if ((await Promise.race([exited.then(() => true), sleep(10_000).then(() => false)])) === false)
    child.kill("SIGKILL");
}
