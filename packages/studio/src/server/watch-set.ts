/**
 * Watch a set of resolved file paths for change, creation and deletion.
 *
 * Two mechanisms run together because they fail on opposite axes. Native
 * directory notifications (see `watch-set-directories`) cost one descriptor
 * per directory and carry the latency; `fs.watchFile` polls each path by name,
 * costs no descriptors at all, and is the only mechanism that survives a path
 * that does not exist yet, a parent directory that does not exist yet, and a
 * filesystem where notifications never arrive — a container bind mount, a
 * network share. That last case is why no separate liveness handshake is
 * needed.
 *
 * Both see the same edit, so each path carries the state it was last reported
 * at and a repeat of that state is dropped (see `watch-set-ledger`); without
 * it one save surfaces twice.
 *
 * The watched set is expected to change. `update` re-arms, keeping the watches
 * that are still wanted so no event falls into a teardown gap.
 */

import { unwatchFile, watchFile } from "node:fs";
import { resolve } from "node:path";
import { type FileSignature, signatureOf } from "./file-signature";
import {
  createDirectoryWatchers,
  groupByDirectory,
  type WatchDegradation,
} from "./watch-set-directories";
import { createChangeLedger } from "./watch-set-ledger";

export type { WatchDegradation } from "./watch-set-directories";

/** Poll interval for the path layer. The directory layer carries the latency. */
const POLL_INTERVAL_MS = 500;
const DEFAULT_DEBOUNCE_MS = 100;

export interface WatchSetStatus {
  /** Paths tracked right now */
  pathCount: number;
  /** Directories carrying a native watch right now */
  directoryCount: number;
  /** Set once the platform refuses a watch; cleared by the next re-arm */
  degraded: WatchDegradation | null;
}

export interface WatchSetOptions {
  /** Absolute paths to watch. Relative entries resolve against the cwd. */
  paths: readonly string[];
  /** Receives every path that changed since the previous call. */
  onChange: (changed: string[]) => void;
  /** Receives the first refusal after each re-arm. */
  onDegraded?: (degradation: WatchDegradation) => void;
  debounceMs?: number;
}

export interface WatchSet {
  /**
   * Replace the watched set. Safe to call from inside `onChange`.
   *
   * Each path in `expected` is compared, once it is watched, with the hash of
   * what it held when a load read it (the sha256 of its bytes, `null` for
   * absent, `"unreadable"`). One that differs changed while the load ran,
   * before anything watched it; it is reported at once, not after the
   * debounce, together with any change still waiting, so it joins a reload
   * already queued rather than queueing one more. Its present state is then
   * taken as reported, so the notification of that same state is dropped.
   *
   * A path that still holds the bytes the load read is left as it was, a
   * notification waiting for it included. That notification may stand for a
   * version the load evaluated in place of the bytes it read, so it still
   * reloads, and a touch is never dropped.
   */
  update(paths: readonly string[], expected?: ReadonlyMap<string, string | null>): void;
  /**
   * Take tracked paths as seen in their present state: a change already
   * pending for them is dropped, and only a later one is reported.
   */
  acknowledge(paths: readonly string[]): void;
  stop(): void;
  status(): WatchSetStatus;
}

/**
 * Watch a set of paths, and report each change once.
 *
 * @param options - The paths, where changes and refused watches are reported,
 *   and the debounce
 * @returns The watch set
 * @example
 * ```ts
 * const set = createWatchSet({ paths: [configFile], onChange: (changed) => reload(changed) });
 * set.update(loaded.deps, loaded.depHashes);
 * ```
 */
export function createWatchSet(options: WatchSetOptions): WatchSet {
  const { onChange, onDegraded, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

  let tracked: string[] = [];
  const polled = new Set<string>();
  const ledger = createChangeLedger({ debounceMs, onChange });
  let degraded: WatchDegradation | null = null;
  let stopped = false;

  const directories = createDirectoryWatchers({
    onHit: (path) => ledger.record(path),
    onOverflow: () => ledger.markAll(tracked),
    onRefused: (refusal) => {
      if (degraded) return;
      degraded = refusal;
      onDegraded?.(refusal);
    },
  });

  /* The state a path is watched from. `watchFile` calls back once at once
     for a file that does not exist, and without a baseline that call would
     read as a change: a Studio started before its config existed would
     report a failed reload on every start. A path with an expected hash
     takes its baseline from the comparison instead, read once the watches
     are armed. */
  function watch(path: string, expected: ReadonlyMap<string, string | null>): void {
    if (!expected.has(path)) ledger.baseline(path);
    watchFile(path, { persistent: true, interval: POLL_INTERVAL_MS }, () => ledger.record(path));
    polled.add(path);
  }

  function release(path: string): void {
    unwatchFile(path);
    polled.delete(path);
    ledger.forget(path);
  }

  /* Read after the watches are armed: a change before the read shows up as a
     difference from the load's hash, and one after it as a notification. */
  function compare(expected: ReadonlyMap<string, string | null>, added: ReadonlySet<string>): void {
    const changes = new Map<string, FileSignature>();
    for (const [path, hash] of expected) {
      if (!polled.has(path)) continue;
      const signature = signatureOf(path);
      if (signature.contentHash !== hash) changes.set(path, signature);
      else if (added.has(path)) ledger.baseline(path, signature);
    }
    ledger.markChanged(changes);
  }

  function update(paths: readonly string[], expected?: ReadonlyMap<string, string | null>): void {
    if (stopped) return;
    tracked = [...new Set(paths.map((p) => resolve(p)))];
    const wanted = new Map([...(expected ?? [])].map(([path, hash]) => [resolve(path), hash]));

    for (const path of polled) if (!tracked.includes(path)) release(path);
    const added = new Set(tracked.filter((path) => !polled.has(path)));
    for (const path of added) watch(path, wanted);

    degraded = null;
    directories.sync(groupByDirectory(tracked));
    compare(wanted, added);
  }

  update(options.paths);

  function acknowledge(paths: readonly string[]): void {
    if (stopped) return;
    for (const path of paths.map((p) => resolve(p))) {
      if (polled.has(path)) ledger.acknowledge(path);
    }
  }

  return {
    update,
    acknowledge,
    stop(): void {
      stopped = true;
      ledger.stop();
      directories.closeAll();
      for (const path of polled) unwatchFile(path);
      polled.clear();
    },
    status(): WatchSetStatus {
      return { pathCount: tracked.length, directoryCount: directories.size, degraded };
    },
  };
}
