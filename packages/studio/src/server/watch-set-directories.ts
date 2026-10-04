/**
 * The native half of a watch set: one `fs.watch` per distinct directory.
 *
 * A watch bound to a directory reports creations, deletions and renames of the
 * entries inside it, and survives the write-temp-then-rename an editor performs
 * on save. A watch bound to a file does not: it follows the inode, so the
 * moment the inode is replaced it is watching something that is no longer
 * there while reporting nothing.
 */

import { existsSync, type FSWatcher, watch } from "node:fs";
import { basename, dirname } from "node:path";
import { errnoCode } from "./errno-code";
import { messageOf } from "./message-of";

/** Why the platform refused a native watch. */
export interface WatchDegradation {
  kind: "limit" | "permission" | "unknown";
  path: string;
  message: string;
}

/** Per directory, the tracked paths in it by their lower-cased name. */
export type TrackedByDirectory = ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;

export interface DirectoryWatchersOptions {
  /** A tracked entry in a watched directory changed; receives its tracked path. */
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
  sync(byDirectory: TrackedByDirectory): void;
  closeAll(): void;
  readonly size: number;
}

/**
 * Group tracked paths by their directory, and each by its lower-cased name.
 *
 * @param paths - The tracked paths, resolved
 * @returns What {@link DirectoryWatchers.sync} takes
 */
export function groupByDirectory(paths: readonly string[]): TrackedByDirectory {
  const byDirectory = new Map<string, Map<string, string[]>>();
  for (const path of paths) {
    const directory = dirname(path);
    const names = byDirectory.get(directory) ?? new Map<string, string[]>();
    const name = basename(path).toLowerCase();
    names.set(name, [...(names.get(name) ?? []), path]);
    byDirectory.set(directory, names);
  }
  return byDirectory;
}

function classify(err: unknown, path: string): WatchDegradation {
  const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
  const message = messageOf(err);
  if (code === "ENOSPC") return { kind: "limit", path, message };
  if (code === "EPERM" || code === "EACCES") return { kind: "permission", path, message };
  return { kind: "unknown", path, message };
}

export function createDirectoryWatchers(options: DirectoryWatchersOptions): DirectoryWatchers {
  const { onHit, onOverflow, onRefused } = options;
  const watchers = new Map<string, FSWatcher>();
  let names: TrackedByDirectory = new Map();

  /* A directory that is not there — not created yet, or removed — is no
     refusal: the comparison pass covers the paths in it, and the next sync
     arms it once it exists. */
  const arm = (directory: string): void => {
    if (!existsSync(directory)) return;
    let watcher: FSWatcher;
    try {
      watcher = watch(directory, { persistent: true });
    } catch (err) {
      if (errnoCode(err) !== "ENOENT") onRefused(classify(err, directory));
      return;
    }
    /* Without this listener a negative libuv status arrives as an unhandled
       'error' event, which ends the process rather than the watch. */
    watcher.on("error", (err) => {
      watchers.delete(directory);
      watcher.close();
      if (existsSync(directory)) onRefused(classify(err, directory));
    });
    watcher.on("change", (_event, filename) => {
      if (filename === null || filename === undefined) {
        onOverflow();
        return;
      }
      /* Compared case-blind: the filesystem reports the name as it is stored
         on disk, which need not be the casing the writer used. The hit names
         the path as tracked, so the comparison pass's report of the same
         save is recognised as the same path. */
      const name = basename(filename.toString()).toLowerCase();
      for (const path of names.get(directory)?.get(name) ?? []) onHit(path);
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
