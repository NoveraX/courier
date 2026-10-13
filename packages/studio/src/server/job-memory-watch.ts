/**
 * Loaded ahead of a worker script, in a process Studio starts for a job
 * with a memory cap (see `startWorkerProcess`): a thread of its own watches
 * the whole process's resident memory — the JavaScript heap, which V8 holds
 * to the job's budget itself, and everything beside it, which nothing else
 * bounds: a native module's, a buffer's — and stops the process the moment
 * it passes the cap, saying so on its stderr first. The thread watches
 * however busy the job keeps the process's own thread, and stops the
 * process too once Studio, which started it, is gone.
 */

import { Worker } from "node:worker_threads";

import { JOB_MEMORY_CAP } from "./job-memory-cap";

/* Often enough that a process allocating fast passes its cap by little. */
const WATCH_EVERY_MS = 20;
/* How often the thread asks whether Studio is still there. */
const PARENT_EVERY_MS = 1_000;

const WATCH = `
const { writeSync } = require("node:fs");
const { workerData } = require("node:worker_threads");
const { capBytes, capMb, parent, passed, everyMs, parentEveryMs } = workerData;
const stop = (why) => {
  if (why) writeSync(2, why + "\\n");
  process.kill(process.pid, "SIGKILL");
};
setInterval(() => {
  const rss = process.memoryUsage.rss();
  if (rss > capBytes) stop(passed + ": " + Math.round(rss / 1048576) + " MB, past the " + capMb + " MB it may take");
}, everyMs);
setInterval(() => {
  try {
    process.kill(parent, 0);
  } catch {
    stop();
  }
}, parentEveryMs);
`;

const capMb = Number(process.env[JOB_MEMORY_CAP.env]);
if (Number.isFinite(capMb) && capMb > 0) {
  const watch = new Worker(WATCH, {
    eval: true,
    workerData: {
      capBytes: capMb * 1024 * 1024,
      capMb,
      parent: process.ppid,
      passed: JOB_MEMORY_CAP.passed,
      everyMs: WATCH_EVERY_MS,
      parentEveryMs: PARENT_EVERY_MS,
    },
  });
  /* The job, not its watch, keeps the process running. */
  watch.unref();
}
