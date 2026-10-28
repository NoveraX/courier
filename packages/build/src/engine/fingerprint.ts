import { createHash } from "node:crypto";
import { statSync } from "node:fs";

import type { RoutesSnapshot } from "./routes-snapshot";

/** What no file and no variable can digest to: a fingerprint nothing matches. */
export const UNSETTLED = "unsettled";

/**
 * A digest of what a reading of the routes depended on, as it is now: the
 * size and the time of the last change of every file it read, and the value
 * of every variable it looked at. Equal digests mean the same routes.
 *
 * A file changed after the reading began may have been read before or after
 * the change, so the digest is then {@link UNSETTLED}, which nothing equals,
 * and the next reading reads the routes again.
 *
 * @param snapshot - The reading
 * @param since - When the reading began, in milliseconds since the epoch; omitted, every change counts as before it
 * @returns The digest
 * @example
 * ```ts
 * fingerprintOf(snapshot) === fingerprintOf(snapshot); // true while nothing it read changed
 * ```
 */
export function fingerprintOf(snapshot: RoutesSnapshot, since?: number): string {
  const hash = createHash("sha256").update(snapshot.configFile);
  for (const file of snapshot.files) {
    const stats = statSync(file, { throwIfNoEntry: false });
    if (stats === undefined) {
      hash.update(`\n${file}\0absent`);
      continue;
    }
    if (since !== undefined && stats.mtimeMs >= since) return UNSETTLED;
    hash.update(`\n${file}\0${stats.size}\0${stats.mtimeMs}`);
  }
  for (const [name, value] of variablesOf(snapshot.env)) {
    hash.update(`\n${name}=${value ?? "\0unset"}`);
  }
  return hash.digest("hex");
}

/* The variables the reading looked at, with their values now: every one, when it went through them all. */
function variablesOf(names: RoutesSnapshot["env"]): Array<[string, string | undefined]> {
  const all = names === "*" ? Object.keys(process.env).sort() : names;
  return all.map((name) => [name, process.env[name]]);
}
