import { createHash } from "node:crypto";
import { type FSWatcher, readFileSync, statSync, watch } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";

const log = createLogger("Runtime");

/** How a follower waits: how long a burst of saves may last, and how often every file is looked at. */
export interface FollowTiming {
  /** Saves closer together than this are one change, in milliseconds (default 75). */
  readonly settleMs?: number | undefined;
  /** How often every followed file is looked at, for a save no notification reported, in milliseconds (default 2000). */
  readonly sweepMs?: number | undefined;
}

/** A follower of the files a config depends on: which files, and how it stops. */
export interface ConfigFilesFollower {
  /** Follow these files from now on, in place of the ones followed before. */
  track(files: Iterable<string>): void;
  /** Stop following, and let the process exit. */
  close(): void;
}

/* What a file was when last looked at: how it stands on disk, and what it holds. */
interface Seen {
  stamp: string;
  hash: string;
}

const ABSENT: Seen = { stamp: "absent", hash: "absent" };

/**
 * Follow the files a config depends on, and say when one of them holds
 * something new. Each directory is watched — a watch on a file follows its
 * inode, which an editor's save by rename leaves behind — and every file is
 * looked at again every couple of seconds, for a filesystem whose saves are
 * never announced. A file saved with the bytes it had, or touched, is no
 * change; saves in quick succession are one. Nothing it does keeps the
 * process alive.
 *
 * @param onChange - Told once a burst of saves has settled
 * @param timing - How long a burst may last, and how often every file is looked at
 * @returns The follower
 * @example
 * ```ts
 * const follower = followConfigFiles(() => void reload());
 * follower.track([configFile, ...modules]);
 * ```
 */
export function followConfigFiles(
  onChange: () => void,
  { settleMs = 75, sweepMs = 2000 }: FollowTiming = {},
): ConfigFilesFollower {
  const seen = new Map<string, Seen>();
  const watchers = new Map<string, FSWatcher>();
  let settling: NodeJS.Timeout | undefined;

  const settle = (): void => {
    clearTimeout(settling);
    settling = setTimeout(onChange, settleMs);
    settling.unref();
  };
  const look = (file: string): void => {
    const before = seen.get(file);
    if (before === undefined) return;
    const now = seenOf(file, before);
    if (now.stamp === before.stamp) return;
    seen.set(file, now);
    if (now.hash !== before.hash) settle();
  };
  const sweep = setInterval(() => {
    for (const file of seen.keys()) look(file);
  }, sweepMs);
  sweep.unref();

  function watchDirectory(directory: string): void {
    try {
      const watcher = watch(directory, { persistent: false }, (_event, name) => {
        /* No name: the system dropped events and cannot say which; every file there is looked at. */
        if (name === null) for (const file of seen.keys()) look(file);
        else look(join(directory, name.toString()));
      });
      watcher.on("error", () => watchers.delete(directory));
      watchers.set(directory, watcher);
    } catch (error) {
      log.debug(`Cannot watch ${directory}; its files are looked at every ${sweepMs} ms`, error);
    }
  }

  return {
    track(files) {
      const wanted = new Set(files);
      for (const file of seen.keys()) if (!wanted.has(file)) seen.delete(file);
      for (const file of wanted) if (!seen.has(file)) seen.set(file, seenOf(file, ABSENT));
      const directories = new Set([...seen.keys()].map((file) => dirname(file)));
      for (const [directory, watcher] of watchers) {
        if (directories.has(directory)) continue;
        watcher.close();
        watchers.delete(directory);
      }
      for (const directory of directories) if (!watchers.has(directory)) watchDirectory(directory);
    },
    close() {
      clearTimeout(settling);
      clearInterval(sweep);
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      seen.clear();
    },
  };
}

/* How a file stands now; its bytes are read only when its stamp moved, to tell a real edit from a touch. */
function seenOf(file: string, before: Seen): Seen {
  const stats = statSync(file, { throwIfNoEntry: false });
  if (stats === undefined) return ABSENT;
  const stamp = `${stats.mtimeMs}:${stats.size}:${stats.ino}`;
  if (stamp === before.stamp) return before;
  try {
    return { stamp, hash: createHash("sha1").update(readFileSync(file)).digest("hex") };
  } catch {
    /* Gone between the two looks: the next look sees it absent. */
    return { stamp, hash: `unreadable:${basename(file)}:${stamp}` };
  }
}
