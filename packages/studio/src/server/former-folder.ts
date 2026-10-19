import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import type { ImportStateEntry } from "../apis/imports-state";
import { formerPlacement, type ImportPlacement, type PlacedSource } from "../apis/layout";
import { claimedFiles } from "./import-files/claimed-files";
import { importBodies } from "./import-files/import-bodies";

/** Where Studio 0.3.0 put an import that still has its files there. */
export interface FormerFolder extends PlacedSource {
  /** Whether the folder this release writes holds the import's files too. */
  readonly inBoth: boolean;
}

/**
 * Find the folder Courier Studio 0.3.0 wrote an import into, when this
 * release binds the import otherwise and the folder still holds its files:
 * a file Studio recorded writing for it, or one whose header claims it for
 * it, as in a clone with no record.
 *
 * @param root - The project
 * @param name - The import's key under `imports`
 * @param placement - Its `outputDir` and `sourceName`, a layout Studio accepted
 * @param dir - The folder this release writes it into
 * @param state - What Studio recorded about it, if anything
 * @returns The folder and the binding 0.3.0 gave it, or `undefined` when the import has no such folder
 * @example
 * ```ts
 * formerFolder(root, "undefined", entry, layout.dir, state)?.dir; // "src/api/undefined"
 * ```
 */
export function formerFolder(
  root: ProjectRoot,
  name: string,
  placement: ImportPlacement,
  dir: string,
  state: ImportStateEntry | undefined,
): FormerFolder | undefined {
  const former = formerPlacement(placement, name);
  if (former === undefined || !holdsFilesOf(root, former.dir, name, state)) return undefined;
  return { ...former, inBoth: holdsFilesOf(root, dir, name, state) };
}

/* Read from the folder itself, never through a path the record gives: only a file there counts. */
function holdsFilesOf(
  root: ProjectRoot,
  dir: string,
  name: string,
  state: ImportStateEntry | undefined,
): boolean {
  const recorded = state?.files ?? {};
  if (Object.keys(importBodies(root, dir)).some((path) => Object.hasOwn(recorded, path))) {
    return true;
  }
  return claimedFiles(root, dir, name).length > 0;
}
