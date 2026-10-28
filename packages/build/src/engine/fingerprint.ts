import { createHash } from "node:crypto";
import { readdirSync, type Stats, statSync } from "node:fs";

import { errnoCode } from "../config/errno-code";
import type { RoutesInputs } from "./routes-snapshot";

/** What no file and no variable can digest to: a fingerprint nothing matches. */
export const UNSETTLED = "unsettled";

/**
 * How far before a reading began a file system that keeps whole seconds or
 * coarser (HFS+, FAT, some network ones) may date a change made after it:
 * FAT counts in two-second steps.
 */
const COARSE_CLOCK_MS = 2_000;

/**
 * A digest of what a reading of the routes depended on, as it is now: the
 * size and the time of the last change of every file it read, whether a
 * path it looked at is there and is a folder, the entries of every folder
 * it listed, and the value of every variable it looked at. Equal digests
 * mean the same routes.
 *
 * A file changed after the reading began may have been read before or after
 * the change, so the digest is then {@link UNSETTLED}, which nothing equals,
 * and the next reading reads the routes again. A time kept to the whole
 * millisecond or coarser may date such a change before the reading began, so
 * one within two seconds of its start counts as changed after it.
 *
 * @param inputs - What the reading depended on
 * @param since - When the reading began, in milliseconds since the epoch; omitted, every change counts as before it
 * @returns The digest
 * @example
 * ```ts
 * fingerprintOf(snapshot) === fingerprintOf(snapshot); // true while nothing it read changed
 * ```
 */
export function fingerprintOf(inputs: RoutesInputs, since?: number): string {
  const hash = createHash("sha256").update(inputs.configFile ?? "\0none");
  const parts = [
    ...inputs.files.map((file) => filePart(file, since)),
    ...(inputs.listed ?? []).map((folder) => folderPart(folder, since)),
  ];
  for (const part of parts) {
    if (part === UNSETTLED) return UNSETTLED;
    hash.update(part);
  }
  for (const [name, value] of variablesOf(inputs.env)) {
    hash.update(`\n${name}=${value ?? "\0unset"}`);
  }
  return hash.digest("hex");
}

/* A file by its size and time; a folder, or a path not there, by what it is. */
function filePart(file: string, since: number | undefined): string {
  const stats = statOf(file);
  if (typeof stats === "string") return `\n${file}\0${stats}`;
  if (stats.isDirectory()) return `\n${file}\0folder`;
  if (since !== undefined && changedSince(stats.mtimeMs, since)) return UNSETTLED;
  return `\n${file}\0${stats.size}\0${stats.mtimeMs}`;
}

/* A folder by its entries; one whose entries changed while it was read matches nothing. */
function folderPart(folder: string, since: number | undefined): string {
  const stats = statOf(folder);
  if (since !== undefined && typeof stats !== "string" && changedSince(stats.mtimeMs, since)) {
    return UNSETTLED;
  }
  return `\n${folder}/\0${entriesOf(folder)}`;
}

/* A time with a part below the millisecond comes from a clock that keeps finer ones. */
function changedSince(mtimeMs: number, since: number): boolean {
  return mtimeMs >= (mtimeMs % 1 === 0 ? since - COARSE_CLOCK_MS : since);
}

/* The path's stats, or why there are none: absent, or a code the system gave. */
function statOf(path: string): Stats | string {
  try {
    return statSync(path, { throwIfNoEntry: false }) ?? "absent";
  } catch (error) {
    return errnoCode(error) ?? "unreadable";
  }
}

/* A folder's entries by name, sorted, or why there are none. */
function entriesOf(folder: string): string {
  try {
    return readdirSync(folder).sort().join("\0");
  } catch (error) {
    return `\0${errnoCode(error) ?? "unreadable"}`;
  }
}

/* The variables the reading looked at, with their values now: every one, when it went through them all. */
function variablesOf(names: RoutesInputs["env"]): Array<[string, string | undefined]> {
  const all = names === "*" ? Object.keys(process.env).sort() : names;
  return all.map((name) => [name, process.env[name]]);
}
