import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

/** The folder Studio saves recorded tests in, which `verify` reads when given none. */
export const DEFAULT_RECORDINGS = "tests/recorded";

/* Folders a project's recordings never live in, which a search would only slow. */
const SKIPPED = new Set(["node_modules", "dist", "build", "coverage", "lib"]);

/** The HAR files to check: those named, and those in the folders named. */
export interface FoundRecordings {
  /** Files named outright: one that is not a recordings file is an error */
  named: string[];
  /** Files found in a folder: one that is not a recordings file is passed over */
  found: string[];
}

/**
 * The HAR files `verify` checks: each file named, and every `.har` file in
 * each folder named, at any depth — `node_modules`, build output and
 * hidden folders passed over. With nothing named, the folder Studio saves
 * recorded tests in.
 *
 * @param root - The project root, which relative paths start from
 * @param paths - The files and folders named on the command line
 * @returns The files, in a stable order
 * @throws {Error} When a path named does not exist, or nothing was named and Studio's folder is absent
 * @example
 * ```ts
 * findRecordings("/app", ["tests/recorded"]).found; // ["/app/tests/recorded/checkout.shop.har"]
 * ```
 */
export function findRecordings(root: string, paths: readonly string[]): FoundRecordings {
  const asked = paths.length > 0 ? paths : [DEFAULT_RECORDINGS];
  const recordings: FoundRecordings = { named: [], found: [] };
  for (const path of asked) {
    const absolute = resolve(root, path);
    if (!existsSync(absolute)) {
      throw new Error(
        paths.length > 0
          ? `${path} does not exist`
          : `No recordings to check: ${DEFAULT_RECORDINGS} does not exist. Save a session as a test in Studio, or name the HAR files to check.`,
      );
    }
    if (statSync(absolute).isDirectory()) recordings.found.push(...harFilesIn(absolute));
    else recordings.named.push(absolute);
  }
  return recordings;
}

function harFilesIn(folder: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.name.startsWith(".") || SKIPPED.has(entry.name)) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) files.push(...harFilesIn(path));
    else if (entry.isFile() && entry.name.endsWith(".har")) files.push(path);
  }
  return files;
}
