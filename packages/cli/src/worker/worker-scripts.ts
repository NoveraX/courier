import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/* The CLI's published lib: a worker process runs built code only, so the
   CLI used from source starts it from there as well. */
const LIB = join(
  dirname(createRequire(import.meta.url).resolve("@noverax/courier-cli/package.json")),
  "lib",
);

/**
 * The script of the processes Courier formats a project's files in, each
 * loading the project's ESLint and Prettier once and keeping them for every
 * file after (see `formatInProcess`).
 */
export const FORMAT_WORKER_SCRIPT: string = join(LIB, "format-worker.js");

/**
 * Loaded ahead of a worker script whose process has a memory cap: a thread
 * of its own stops the process once it takes more memory than the cap, or
 * once its parent is gone (see `startWorkerProcess`).
 */
export const JOB_MEMORY_WATCH_SCRIPT: string = join(LIB, "job-memory-watch.js");
