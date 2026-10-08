import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Fixture } from "./fixture";
import { readFixtureFile } from "./fixture-file";
import { FixtureFileError } from "./fixture-file-error";

/**
 * Read the recordings a HAR file of Courier recordings holds — one Studio
 * saved as a test, or a recorder wrote — for a test to check or replay.
 *
 * @param file - The file: a path, or a URL such as `new URL("./checkout.har", import.meta.url)`
 * @returns The recordings, in the order they were made
 * @throws {FixtureFileError} When there is no such file, or it is not a HAR log of Courier recordings
 * @example
 * ```ts
 * const recordings = readRecordings(new URL("./checkout.har", import.meta.url));
 * const checks = await verifyRecordings(config.sources, recordings);
 * ```
 */
export function readRecordings(file: string | URL): Fixture[] {
  const path = typeof file === "string" ? file : fileURLToPath(file);
  if (!existsSync(path)) throw new FixtureFileError(path, { missing: true });
  return readFixtureFile(path);
}
