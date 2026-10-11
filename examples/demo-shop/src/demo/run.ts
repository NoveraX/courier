import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { PORTS } from "../ports";
import { type Part, startPart, stopPart, waitForPort } from "./part";

/* The demo's root: the folder holding courier.config.ts, whatever the working directory. */
const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const RESET_MS = Number(process.env.DEMO_RESET_MINUTES ?? 60) * 60_000;
/* A demo whose part fails sooner than this after it started waits before it starts again. */
const SETTLED_MS = 60_000;

let running: Part[] = [];
let stopping = false;

/* What visitors changed — the requests Studio kept, the mocks' data — goes
   with each reset. The folder is emptied, not removed: in the container it is
   a memory-backed mount, the one place the demo may write. */
function wipeState(): void {
  if (!existsSync(join(ROOT, "courier.config.ts"))) {
    throw new Error(`${ROOT} is not the demo's root; nothing is wiped`);
  }
  const state = join(ROOT, ".courier");
  if (!existsSync(state)) return;
  for (const entry of readdirSync(state))
    rmSync(join(state, entry), { recursive: true, force: true });
}

/* The backends, Studio, the shop's server once Studio listens, and the traffic once the server does. */
async function startDemo(resetsAt: number): Promise<Part[]> {
  wipeState();
  const parts = [startPart("upstream", "src/upstream/main.ts", ROOT)];
  running = parts;
  await waitForPort(PORTS.payments, 30_000);
  parts.push(startPart("studio", "src/demo/studio.ts", ROOT, { DEMO_RESETS_AT: String(resetsAt) }));
  await waitForPort(PORTS.studio, 120_000);
  parts.push(startPart("app", "src/app/main.ts", ROOT));
  await waitForPort(PORTS.app, 60_000);
  parts.push(startPart("traffic", "src/traffic/main.ts", ROOT));
  return parts;
}

/* The traffic first, the backends last: each part stops while what it calls is still there. */
async function stopDemo(): Promise<void> {
  for (const part of [...running].reverse()) await stopPart(part);
  running = [];
}

async function runOnce(): Promise<void> {
  const startedAt = Date.now();
  const resetsAt = startedAt + RESET_MS;
  const parts = await startDemo(resetsAt);
  const failed = Promise.race(parts.map((part) => part.exited.then(() => part.name)));
  const ended = await Promise.race([sleep(resetsAt - Date.now()).then(() => null), failed]);
  if (stopping) return;
  if (ended !== null) console.warn(`The ${ended} part exited; the demo starts again`);
  else console.log("Resetting the demo");
  await stopDemo();
  if (ended !== null && Date.now() - startedAt < SETTLED_MS) await sleep(10_000);
}

/*
 * A terminal's Ctrl+C reaches the demo twice when npm started it, which
 * passes the signal on: the second must not end it halfway through
 * stopping its parts, which would leave them running. Asked again a second
 * or more later, it ends at once.
 */
let stoppingSince: number | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stoppingSince !== undefined) {
      if (Date.now() - stoppingSince >= 1_000) process.exit(1);
      return;
    }
    stoppingSince = Date.now();
    stopping = true;
    stopDemo().finally(() => process.exit(0));
  });
}

console.log(`The demo resets every ${RESET_MS / 60_000} min`);
while (!stopping) {
  try {
    await runOnce();
  } catch (error) {
    console.error("The demo did not start:", error);
    await stopDemo();
    await sleep(10_000);
  }
}
