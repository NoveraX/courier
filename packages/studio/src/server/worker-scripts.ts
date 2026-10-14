import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/* Studio's published lib: a worker process runs built code only, so Studio
   started from source starts it from there as well. */
const LIB = join(
  dirname(createRequire(import.meta.url).resolve("@noverax/courier-studio/package.json")),
  "lib",
);

/**
 * The script of the process Studio reads a specification in, generates its
 * code in or compares two in — one job a process. It greets Studio with the
 * version of what it understands, so a lib built from older source is told
 * apart at once (see `runInProcess`).
 */
export const SPEC_WORKER_SCRIPT = join(LIB, "spec-worker.js");
