import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";

import { lockfilePaths } from "../project/package-manager";
import type { KeptFile, Undone } from "./file-journal";
import { replaceFile } from "./file-ops";

/** The files an install writes, as they were before it, to put them back. */
export interface ManifestSnapshot {
  /**
   * Note each of them as the install left them, once it has run: from
   * then on a file is put back only while it holds what the install
   * left, and one changed since is someone's, and kept.
   */
  installed(): void;
  /**
   * Put back each of them the install changed — one it wrote where none
   * was is removed — so package.json and the lockfile match again. Before
   * the install has run whole, each is put back, whatever it holds: an
   * install cut short may have written part of it.
   *
   * @returns What was put back and removed, and what could not be or was kept, and why
   */
  restore(): Undone;
}

/* Why a file is kept: someone changed it after the install wrote it. */
const CHANGED_AFTER = "it changed after the install wrote it, so it was left as it is";

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
  let left: Map<string, Buffer | undefined> | undefined;
  return {
    installed() {
      left = new Map(paths.map((path) => [path, bytesAt(path)]));
    },
    restore() {
      const removed: string[] = [];
      const putBack: string[] = [];
      const kept: KeptFile[] = [];
      for (const [path, was] of before) {
        const shown = relative(root, path).replaceAll("\\", "/");
        const now = bytesAt(path);
        if (same(now, was)) continue;
        if (left !== undefined && !same(now, left.get(path))) {
          kept.push({ path: shown, why: CHANGED_AFTER });
          continue;
        }
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
