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
 * at and a repeat of that state is dropped; without it one save surfaces twice.
 *
 * The watched set is expected to change. `update` re-arms, keeping the watches
 * that are still wanted so no event falls into a teardown gap.
 */

import { unwatchFile, watchFile } from "node:fs";
import { resolve } from "node:path";
import { signatureOf } from "./file-signature";
import {
  createDirectoryWatchers,
  groupByDirectory,
  type WatchDegradation,
} from "./watch-set-directories";

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
  /** Replace the watched set. Safe to call from inside `onChange`. */
  update(paths: readonly string[]): void;
  /**
   * Take tracked paths as seen in their present state: a change already
   * pending for them is dropped, and only a later one is reported.
   */
  acknowledge(paths: readonly string[]): void;
  stop(): void;
  status(): WatchSetStatus;
}

export function createWatchSet(options: WatchSetOptions): WatchSet {
  const { onChange, onDegraded, debounceMs = DEFAULT_DEBOUNCE_MS } = options;

  let tracked: string[] = [];
  const polled = new Set<string>();
  const pending = new Set<string>();
  /** path → the size and mtime it was last reported at */
  const reportedAt = new Map<string, string>();
  let degraded: WatchDegradation | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (stopped || pending.size === 0) return;
      const changed = [...pending];
      pending.clear();
      onChange(changed);
    }, debounceMs);
  };

  const record = (path: string): void => {
    if (stopped) return;
    const signature = signatureOf(path);
    if (reportedAt.get(path) === signature) return;
    reportedAt.set(path, signature);
    pending.add(path);
    schedule();
  };

  const directories = createDirectoryWatchers({
    onHit: record,
    onOverflow: () => {
      if (stopped) return;
      for (const path of tracked) {
        reportedAt.set(path, signatureOf(path));
        pending.add(path);
      }
      schedule();
    },
    onRefused: (refusal) => {
      if (degraded) return;
      degraded = refusal;
      onDegraded?.(refusal);
    },
  });

  function update(paths: readonly string[]): void {
    if (stopped) return;
    tracked = [...new Set(paths.map((p) => resolve(p)))];

    for (const path of polled) {
      if (tracked.includes(path)) continue;
      unwatchFile(path);
      polled.delete(path);
      reportedAt.delete(path);
    }
    for (const path of tracked) {
      if (polled.has(path)) continue;
      /* The state it is watched from. `watchFile` calls back once at once for
         a file that does not exist, and without a baseline that call read as
         a change: a Studio started before its config existed reported a
         failed reload on every start. */
      if (!reportedAt.has(path)) reportedAt.set(path, signatureOf(path));
      watchFile(path, { persistent: true, interval: POLL_INTERVAL_MS }, () => record(path));
      polled.add(path);
    }

    degraded = null;
    directories.sync(groupByDirectory(tracked));
  }

  update(options.paths);

  function acknowledge(paths: readonly string[]): void {
    if (stopped) return;
    for (const path of paths.map((p) => resolve(p))) {
      if (!polled.has(path)) continue;
      reportedAt.set(path, signatureOf(path));
      pending.delete(path);
    }
  }

  return {
    update,
    acknowledge,
    stop(): void {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
      directories.closeAll();
      for (const path of polled) unwatchFile(path);
      polled.clear();
      reportedAt.clear();
    },
    status(): WatchSetStatus {
      return { pathCount: tracked.length, directoryCount: directories.size, degraded };
    },
  };
}
