import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * The script Studio's threads run — formatting files, reading
 * specifications, generating their code and comparing them — beside
 * Studio's other entries: from source and from the published lib alike,
 * since a thread runs built code only. A thread greets Studio with the
 * version of what it understands, so a lib built from older source is told
 * apart at once (see `runInThread`).
 */
export const STUDIO_THREAD_SCRIPT = join(
  dirname(createRequire(import.meta.url).resolve("@noverax/courier-studio/package.json")),
  "lib",
  "format-worker.js",
);
