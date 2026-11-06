import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

import { lockfilePaths } from "../project/package-manager";
import type { KeptFile, Undone } from "./file-journal";
import { replaceFile } from "./file-ops";

/** The files an install writes, as they were before it, to put them back. */
export interface ManifestSnapshot {
  /**
   * Put back each of them the install changed — one it wrote where none
   * was is removed — so package.json and the lockfile match again.
   *
   * @returns What was put back and removed, and what could not be and why
   */
  restore(): Undone;
}

function bytesAt(path: string): Buffer | undefined {
  return existsSync(path) ? readFileSync(path) : undefined;
}

function same(a: Buffer | undefined, b: Buffer | undefined): boolean {
  return a === undefined || b === undefined ? a === b : a.equals(b);
}

/**
 * Note the project's package.json and its lockfiles — the project's own,
 * or its workspace's — byte for byte, before an install changes them.
 * `node_modules` is not among them: an install of what the lockfile says
 * puts it back.
 *
 * @param root - The project's folder
 * @returns The snapshot
 * @example
 * ```ts
 * const snapshot = snapshotManifests(root);
 * await install(root, commands); // fails
 * snapshot.restore(); // { removed: [], putBack: ["package.json", "package-lock.json"], kept: [] }
 * ```
 */
export function snapshotManifests(root: string): ManifestSnapshot {
  const paths = [join(root, "package.json"), ...lockfilePaths(root)];
  const before = new Map(paths.map((path) => [path, bytesAt(path)]));
  return {
    restore() {
      const removed: string[] = [];
      const putBack: string[] = [];
      const kept: KeptFile[] = [];
      for (const [path, was] of before) {
        const shown = relative(root, path).replaceAll("\\", "/");
        if (same(bytesAt(path), was)) continue;
        try {
          if (was === undefined) {
            unlinkSync(path);
            removed.push(shown);
          } else {
            replaceFile(path, was);
            putBack.push(shown);
          }
        } catch (error) {
          kept.push({ path: shown, why: error instanceof Error ? error.message : String(error) });
        }
      }
      return { removed, putBack, kept };
    },
  };
}
