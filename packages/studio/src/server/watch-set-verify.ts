/**
 * The comparison half of a watch set: passes over the disk at an interval,
 * for the saves no change notification announces — a network share, a
 * container's bind mount — and the ones a notification dropped.
 *
 * A path in a directory that announces its saves is a safety net's concern:
 * it is looked up once every `safetyEvery` passes, the paths spread evenly
 * across them. A path in one that does not is looked up every pass. A lookup
 * is a system call that costs a few microseconds when made cold, as passes
 * make it, so how often each path is looked up is the whole cost of watching.
 *
 * Each file that exists is looked up itself; the absent paths in a directory
 * are looked up through the directory, once between them: creating, deleting
 * or renaming an entry changes the directory.
 */

import { dirname } from "node:path";
import { stateMayDiffer } from "./state-may-differ";
import { type WatchedState, watchedState } from "./watched-state";

/** What a pass found at a path it hands on. */
export interface Suspicion {
  /** Looked up by the safety net: its directory announces its saves. */
  safetyNet: boolean;
  /** When the path was last modified; `null` when there is nothing there. */
  modifiedAt: number | null;
}

export interface VerifierOptions {
  /** How often a pass runs, in milliseconds. */
  intervalMs: number;
  /** Every how many passes a path in a directory that announces its saves is looked up. */
  safetyEvery: number;
  /** Whether a directory announces its saves; asked when a path is placed or retiered. */
  announces: (directory: string) => boolean;
  /** A tracked path may have changed since it was last looked up. */
  onSuspect: (path: string, suspicion: Suspicion) => void;
}

/** The comparison passes of a watch set. */
export interface Verifier {
  /** Compare these paths from the next pass on; a path kept keeps what was seen of it. */
  sync(paths: readonly string[]): void;
  /** Ask again which directories announce their saves. */
  retier(): void;
  /** How many paths the passes look up: each file there is, and one directory for the absent paths in it. */
  readonly size: number;
  /** How many of them every pass looks up, rather than the safety net. */
  readonly everyPass: number;
  stop(): void;
}

interface Slot {
  /** Looked up every pass, rather than by the safety net. */
  frequent: boolean;
  /** The pass, modulo `safetyEvery`, the safety net looks it up on. */
  slot: number;
}

interface FileEntry extends Slot {
  seen: WatchedState;
}

interface DirectoryEntry extends Slot {
  /** What is at the directory itself, which need not exist yet. */
  seen: WatchedState | null;
  /** The absent tracked paths in it. */
  paths: Set<string>;
}

/**
 * Compare tracked paths with the disk: each path in a directory that does not
 * announce its saves on every pass, each other one once every `safetyEvery`.
 *
 * @param options - The interval, the safety net's rate, which directories
 *   announce their saves, and where a path that may have changed goes
 * @returns The verifier; it runs until stopped
 * @example
 * ```ts
 * const verifier = createVerifier({
 *   intervalMs: 500,
 *   safetyEvery: 10,
 *   announces: (directory) => trust.announces(directory),
 *   onSuspect: (path) => ledger.record(path),
 * });
 * verifier.sync(["/app/courier.config.ts", "/app/src/api.js"]);
 * ```
 */
export function createVerifier(options: VerifierOptions): Verifier {
  const { intervalMs, safetyEvery, announces, onSuspect } = options;
  const files = new Map<string, FileEntry>();
  const waiting = new Map<string, DirectoryEntry>();
  let pass = 0;
  let nextSlot = 0;

  const slotIn = (directory: string): Slot => ({
    frequent: !announces(directory),
    slot: nextSlot++ % safetyEvery,
  });
  const due = (entry: Slot): boolean => entry.frequent || entry.slot === pass % safetyEvery;
  const suspect = (path: string, entry: Slot, seen: WatchedState | null): void =>
    onSuspect(path, { safetyNet: !entry.frequent, modifiedAt: seen?.mtimeMs ?? null });

  function wait(path: string): void {
    const directory = dirname(path);
    const entry = waiting.get(directory) ?? {
      seen: watchedState(directory),
      paths: new Set<string>(),
      ...slotIn(directory),
    };
    entry.paths.add(path);
    waiting.set(directory, entry);
  }

  function compareFiles(now: number): void {
    for (const [path, entry] of files) {
      if (!due(entry)) continue;
      const seen = watchedState(path);
      if (seen !== null && !stateMayDiffer(entry.seen, seen, now)) continue;
      if (seen === null) {
        files.delete(path);
        wait(path);
      } else {
        entry.seen = seen;
      }
      suspect(path, entry, seen);
    }
  }

  function compareDirectories(now: number): void {
    for (const [directory, entry] of waiting) {
      if (!due(entry)) continue;
      const seen = watchedState(directory);
      if (!stateMayDiffer(entry.seen, seen, now)) continue;
      entry.seen = seen;
      for (const path of [...entry.paths]) {
        const found = watchedState(path);
        if (found !== null) {
          entry.paths.delete(path);
          files.set(path, { seen: found, ...slotIn(directory) });
        }
        suspect(path, entry, found);
      }
      if (entry.paths.size === 0) waiting.delete(directory);
    }
  }

  const timer = setInterval(() => {
    const now = Date.now();
    compareFiles(now);
    compareDirectories(now);
    pass += 1;
  }, intervalMs);
  /* The native watches keep the process alive while anything is watched. */
  timer.unref();

  return {
    sync(paths): void {
      const wanted = new Set(paths);
      for (const path of files.keys()) if (!wanted.has(path)) files.delete(path);
      for (const [directory, entry] of waiting) {
        for (const path of entry.paths) if (!wanted.has(path)) entry.paths.delete(path);
        if (entry.paths.size === 0) waiting.delete(directory);
      }
      for (const path of wanted) {
        if (files.has(path) || waiting.get(dirname(path))?.paths.has(path)) continue;
        const seen = watchedState(path);
        if (seen === null) wait(path);
        else files.set(path, { seen, ...slotIn(dirname(path)) });
      }
    },
    retier(): void {
      for (const [path, entry] of files) entry.frequent = !announces(dirname(path));
      for (const [directory, entry] of waiting) entry.frequent = !announces(directory);
    },
    get size(): number {
      return files.size + waiting.size;
    },
    get everyPass(): number {
      let count = 0;
      for (const entry of files.values()) if (entry.frequent) count += 1;
      for (const entry of waiting.values()) if (entry.frequent) count += 1;
      return count;
    },
    stop(): void {
      clearInterval(timer);
      files.clear();
      waiting.clear();
    },
  };
}
