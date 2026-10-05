import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { errnoCode } from "../errno-code";

/** What a folder holds: its files' bytes, and how many entries it has at its top. */
export interface FolderSize {
  bytes: number;
  entries: number;
}

function bytesUnder(path: string): number {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.size;
  let bytes = 0;
  for (const name of readdirSync(path)) bytes += bytesUnder(join(path, name));
  return bytes;
}

/**
 * How much a folder Studio keeps holds: the bytes of every file under it —
 * a link counted as nothing, since what it points at is not Studio's — and
 * its entries at the top, which `keep` narrows. A folder that is not there
 * holds nothing.
 *
 * @param path - The folder
 * @param keep - Which top entries count, by name
 * @returns Its size
 * @example
 * ```ts
 * folderSize(join(root, ".courier", "mocks"), (name) => name.endsWith(".sqlite"));
 * ```
 */
export function folderSize(path: string, keep: (name: string) => boolean = () => true): FolderSize {
  let names: string[];
  try {
    names = readdirSync(path).filter(keep);
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return { bytes: 0, entries: 0 };
    throw error;
  }
  let bytes = 0;
  for (const name of names) bytes += bytesUnder(join(path, name));
  return { bytes, entries: names.length };
}
