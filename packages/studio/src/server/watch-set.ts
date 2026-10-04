/**
 * Watch a set of resolved file paths for change, creation and deletion.
 *
 * Two mechanisms run together because they fail on opposite axes. Native
 * directory notifications (see `watch-set-directories`) cost one descriptor
 * per directory and report a save at once, but never arrive from some
 * filesystems — a container bind mount, a network share — and say nothing of
 * a directory that does not exist yet. A comparison pass (see
 * `watch-set-verify`) looks the tracked paths up every half second, all in
 * one go, and catches what the notifications missed, on any filesystem; that
 * is why no separate liveness handshake is needed.
 *
 * Both see the same edit, so each path carries the state it was last reported
 * at and a repeat of that state is dropped (see `watch-set-ledger`); without
 * it one save surfaces twice.
 *
 * The watched set is expected to change. `update` re-arms, keeping the watches
 * that are still wanted so no event falls into a teardown gap.
 */

import { dirname, resolve } from "node:path";
import { type FileSignature, signatureOf } from "./file-signature";
import { createNotificationTrust, type NotificationTrust } from "./notification-trust";
import { pollsEverywhere } from "./watch-polling-setting";
import { pathAliases } from "./watch-set-aliases";
import {
  createDirectoryWatchers,
  groupByDirectory,
  type WatchDegradation,
} from "./watch-set-directories";
import { createChangeLedger } from "./watch-set-ledger";
import { createWatchSetSweep } from "./watch-set-sweep";
import { createVerifier, type Suspicion } from "./watch-set-verify";

export type { WatchDegradation } from "./watch-set-directories";

const DEFAULT_DEBOUNCE_MS = 100;

/** How the comparison passes run. The directory layer carries the latency. */
export interface WatchSetComparison {
  /** How often a pass runs: a path where saves are not announced is compared every pass. */
  intervalMs: number;
  /** Every how many passes a path where saves are announced is compared, as a safety net. */
  safetyEvery: number;
  /**
   * How old a save the safety net finds, unreported, must be to count as one
   * no notification announced, rather than one whose notification is on its way.
   */
  graceMs: number;
}

const DEFAULT_COMPARISON: WatchSetComparison = { intervalMs: 500, safetyEvery: 10, graceMs: 2_000 };

export interface WatchSetStatus {
  /** Paths tracked right now */
  pathCount: number;
  /** Directories carrying a native watch right now */
  directoryCount: number;
  /** Paths the comparison passes look up: the tracked files there are, and a directory for the absent paths in it */
  comparedCount: number;
  /** How many of them every pass looks up: those where saves are not announced */
  comparedEveryPass: number;
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
  /** How the comparison passes run; half-second passes and a five-second safety net by default. */
  comparison?: WatchSetComparison;
  /** Which directories announce their saves; judged from the filesystems and `COURIER_WATCH_POLLING` by default. */
  trust?: NotificationTrust;
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
  /**
   * Compare every watched path with what is on disk now, and report each
   * that changed since it was last reported, together with every change
   * still waiting out the debounce, without waiting the debounce out: a
   * reader can then catch up with saves whose notifications have not come.
   *
   * A save may still be in progress, and must not be read half-done: while
   * a path's timestamp is within the last debounce (a deleted path's, its
   * directory's), or it changed while it was compared, the sweep compares
   * again one debounce later, until `until`. Saves still in progress then
   * are left to the debounce, and nothing is reported. Each state it reports
   * is taken as seen, so the notification of that same state is dropped.
   * Callers that ask before a sweep has reported share it, and it waits
   * until the latest of their deadlines.
   *
   * @param until - When to stop waiting for saves in progress, in epoch milliseconds
   * @returns `true` once what changed is reported; `false` when saves were
   *   still in progress at `until`, or the set is stopped
   */
  sweep(until: number): Promise<boolean>;
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
 * await set.sweep(Date.now() + 3_000); // saves already on disk are reported now
 * ```
 */
export function createWatchSet(options: WatchSetOptions): WatchSet {
  const { onChange, onDegraded, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
  const comparison = options.comparison ?? DEFAULT_COMPARISON;
  const trust = options.trust ?? createNotificationTrust({ pollEverywhere: pollsEverywhere() });

  let tracked: string[] = [];
  let trackedSet: ReadonlySet<string> = new Set();
  let aliases: ReadonlyMap<string, readonly string[]> = new Map();
  /* A link and its target are one file: a save is told once, by whichever
     of the two told of it first. */
  const ledger = createChangeLedger({
    debounceMs,
    onChange: (changed) => {
      for (const path of changed) {
        for (const alias of aliases.get(path) ?? []) {
          if (!changed.includes(alias)) ledger.acknowledge(alias);
        }
      }
      onChange(changed);
    },
  });
  const sweeper = createWatchSetSweep({
    debounceMs,
    unreported: () => ledger.unreported(tracked),
    waiting: ledger.waiting,
    report: ledger.report,
  });
  let degraded: WatchDegradation | null = null;
  let stopped = false;

  const directories = createDirectoryWatchers({
    onHit: (path) => ledger.record(path),
    onOverflow: () => ledger.markAll(tracked),
    onRefused: (refusal) => {
      trust.refused(refusal.path);
      verifier.retier();
      if (degraded) return;
      degraded = refusal;
      onDegraded?.(refusal);
    },
  });

  /* A save the safety net finds that no notification reported, old enough
     that one would have come, says the filesystem does not announce saves:
     from the second, its paths are compared every pass. */
  function suspected(path: string, { safetyNet, modifiedAt }: Suspicion): void {
    if (!ledger.record(path) || !safetyNet || modifiedAt === null) return;
    if (Date.now() - modifiedAt < comparison.graceMs) return;
    if (trust.missed(dirname(path))) verifier.retier();
  }

  const verifier = createVerifier({
    intervalMs: comparison.intervalMs,
    safetyEvery: comparison.safetyEvery,
    announces: (directory) => trust.announces(directory),
    onSuspect: suspected,
  });

  /* Read after the watches are armed: a change before the read shows up as a
     difference from the load's hash, and one after it as a notification. */
  function compare(expected: ReadonlyMap<string, string | null>, added: ReadonlySet<string>): void {
    const changes = new Map<string, FileSignature>();
    for (const [path, hash] of expected) {
      if (!trackedSet.has(path)) continue;
      const signature = signatureOf(path);
      if (signature.contentHash !== hash) changes.set(path, signature);
      else if (added.has(path)) ledger.baseline(path, signature);
    }
    ledger.markChanged(changes);
  }

  function update(paths: readonly string[], expected?: ReadonlyMap<string, string | null>): void {
    if (stopped) return;
    const previous = trackedSet;
    tracked = [...new Set(paths.map((p) => resolve(p)))];
    trackedSet = new Set(tracked);
    aliases = pathAliases(tracked);
    const wanted = new Map([...(expected ?? [])].map(([path, hash]) => [resolve(path), hash]));

    for (const path of previous) if (!trackedSet.has(path)) ledger.forget(path);
    const added = new Set(tracked.filter((path) => !previous.has(path)));
    /* The state a path is watched from. A path with an expected hash takes
       its baseline from the comparison instead, read once the watches are
       armed. */
    for (const path of added) if (!wanted.has(path)) ledger.baseline(path);

    degraded = null;
    directories.sync(groupByDirectory(tracked));
    verifier.sync(tracked);
    compare(wanted, added);
  }

  update(options.paths);

  function acknowledge(paths: readonly string[]): void {
    if (stopped) return;
    for (const path of paths.map((p) => resolve(p))) {
      if (trackedSet.has(path)) ledger.acknowledge(path);
    }
  }

  return {
    update,
    acknowledge,
    sweep: (until) => sweeper.run(until),
    stop(): void {
      stopped = true;
      sweeper.stop();
      ledger.stop();
      directories.closeAll();
      verifier.stop();
    },
    status(): WatchSetStatus {
      return {
        pathCount: tracked.length,
        directoryCount: directories.size,
        comparedCount: verifier.size,
        comparedEveryPass: verifier.everyPass,
        degraded,
      };
    },
  };
}
