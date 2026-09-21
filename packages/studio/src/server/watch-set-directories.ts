/**
 * The native half of a watch set: one `fs.watch` per distinct directory.
 *
 * A watch bound to a directory reports creations, deletions and renames of the
 * entries inside it, and survives the write-temp-then-rename an editor performs
 * on save. A watch bound to a file does not: it follows the inode, so the
 * moment the inode is replaced it is watching something that is no longer
 * there while reporting nothing.
 */

import { type FSWatcher, watch } from "node:fs";
import { basename, resolve } from "node:path";

/** Why the platform refused a native watch. */
export interface WatchDegradation {
  kind: "limit" | "permission" | "unknown";
  path: string;
  message: string;
}

export interface DirectoryWatchersOptions {
  /** A tracked entry in a watched directory changed. */
  onHit: (path: string) => void;
  /**
   * The platform dropped events and cannot say which — on Windows this is
   * libuv relaying a full `ReadDirectoryChangesW` buffer. The only correct
   * response is to treat every tracked path as changed.
   */
  onOverflow: () => void;
  onRefused: (degradation: WatchDegradation) => void;
}

export interface DirectoryWatchers {
  /** Arm the given directories and release the ones no longer listed. */
  sync(byDirectory: ReadonlyMap<string, ReadonlySet<string>>): void;
  closeAll(): void;
  readonly size: number;
}

function classify(err: unknown, path: string): WatchDegradation {
  const code = (err as { code?: string }).code;
  const message = err instanceof Error ? err.message : String(err);
  if (code === "ENOSPC") return { kind: "limit", path, message };
  if (code === "EPERM" || code === "EACCES") return { kind: "permission", path, message };
  return { kind: "unknown", path, message };
}

export function createDirectoryWatchers(options: DirectoryWatchersOptions): DirectoryWatchers {
  const { onHit, onOverflow, onRefused } = options;
  const watchers = new Map<string, FSWatcher>();
  let names: ReadonlyMap<string, ReadonlySet<string>> = new Map();

  const arm = (directory: string): void => {
    let watcher: FSWatcher;
    try {
      watcher = watch(directory, { persistent: true });
    } catch (err) {
      onRefused(classify(err, directory));
      return;
    }
    /* Without this listener a negative libuv status arrives as an unhandled
       'error' event, which ends the process rather than the watch. */
    watcher.on("error", (err) => {
      watchers.delete(directory);
      watcher.close();
      onRefused(classify(err, directory));
    });
    watcher.on("change", (_event, filename) => {
      if (filename === null || filename === undefined) {
        onOverflow();
        return;
      }
      /* Compared case-blind: the filesystem reports the name as it is stored
         on disk, which need not be the casing the writer used. */
      const name = basename(filename.toString()).toLowerCase();
      if (names.get(directory)?.has(name)) onHit(resolve(directory, name));
    });
    watchers.set(directory, watcher);
  };

  return {
    sync(byDirectory): void {
      names = byDirectory;
      for (const [directory, watcher] of watchers) {
        if (byDirectory.has(directory)) continue;
        watcher.close();
        watchers.delete(directory);
      }
      for (const directory of byDirectory.keys()) {
        if (!watchers.has(directory)) arm(directory);
      }
    },
    closeAll(): void {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
    },
    get size(): number {
      return watchers.size;
    },
  };
}
