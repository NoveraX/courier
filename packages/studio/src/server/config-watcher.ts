/**
 * The engine that loads the project: `courier.config.ts`, `courier.mocks.ts`
 * and every module they transitively import.
 *
 * Every load runs on one chain, one at a time and in order: the first, each
 * reload after a change, and each edit an exclusive transaction makes. The
 * outcome of each goes to the owner through `onApplied` or `onFailed`, in the
 * order the loads ran. After the first outcome the watch set is armed; every
 * load that succeeds re-arms it with the modules it read, so a module the
 * config has only just started importing is watched from that moment.
 */

import { createLogger } from "@noverax/courier";
import { armWatchSet } from "./arm-watch-set";
import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
import { type ExclusiveTransaction, exclusiveContext } from "./exclusive-reload";
import { createReloadQueue } from "./reload-queue";
import { createWatchSet, type WatchDegradation } from "./watch-set";
import type { WatcherStatus } from "./watcher-status";

const log = createLogger("Studio");

export interface ConfigWatcherDeps {
  /** The project root, symlinks resolved. */
  projectRoot: string;
  /** Told the watched count and each change. */
  watcherStatus?: WatcherStatus;
  /** What Studio runs now, lent to exclusive edits. */
  current(): LoadedCourierConfig | null;
  /** A load succeeded; Studio runs it from now on. Called in chain order. */
  onApplied(loaded: LoadedCourierConfig): void;
  /** A load failed; Studio keeps running what it ran. Called in chain order. */
  onFailed(error: unknown): void;
}

export interface ConfigWatcher {
  /** Release every watch; outcomes of loads still running are dropped. */
  stop(): void;
  /** Resolves once no load is queued or running, the first load included. */
  settled(): Promise<void>;
  /** Resolves once no edit run with `runExclusive` is queued or running. */
  editsSettled(): Promise<void>;
  /**
   * Run an edit of the watched files alone on the reload chain: loads queued
   * before it run first, and reloads its own writes or anyone else's trigger
   * meanwhile run after it. Studio changes only through the context's
   * `apply`, so a transaction that does not apply leaves it as it was.
   *
   * @param transaction - The edit
   * @param timeoutMs - How long one `load` inside it may take
   * @param dropped - Aborted when the caller gave up before the edit started; it then stops counting as under way
   */
  runExclusive<TResult>(
    transaction: ExclusiveTransaction<TResult>,
    timeoutMs: number,
    dropped?: AbortSignal,
  ): Promise<TResult>;
}

/** A refused watch leaves the poll layer running, so say so rather than throw. */
function reportDegradation({ kind, path, message }: WatchDegradation): void {
  const advice =
    kind === "limit" ? " Raise fs.inotify.max_user_watches to restore native notifications." : "";
  log.warn(`Cannot watch ${path}: ${message}. Falling back to polling it.${advice}`);
}

/**
 * Load the project on the reload chain, watch it, and reload on each change.
 *
 * The first load starts at once; nothing is watched until it has an outcome.
 *
 * @param deps - The project root, and where each outcome goes
 * @returns The engine
 *
 * @example
 * ```ts
 * const engine = startConfigWatcher({ projectRoot, current, onApplied, onFailed });
 * await engine.settled();
 * ```
 */
export function startConfigWatcher(deps: ConfigWatcherDeps): ConfigWatcher {
  let stopped = false;
  const queue = createReloadQueue(reload, load);
  const watchSet = createWatchSet({
    paths: [],
    onChange: (changed) => queue.request(changed),
    onDegraded: reportDegradation,
  });
  const arming = armWatchSet(watchSet, deps);

  function apply(loaded: LoadedCourierConfig): void {
    arming.succeeded(loaded.deps);
    deps.onApplied(loaded);
  }

  async function load(): Promise<void> {
    if (stopped) return;
    let loaded: LoadedCourierConfig;
    try {
      loaded = await loadCourierConfig(deps.projectRoot);
    } catch (err) {
      if (stopped) return;
      arming.failed();
      deps.onFailed(err);
      return;
    }
    /* A stop while it loaded must not push a config into a server that has
       already torn its state down. */
    if (!stopped) apply(loaded);
  }

  async function reload(changed: string[]): Promise<void> {
    if (stopped) return;
    deps.watcherStatus?.emitChange("api", changed);
    await load();
  }

  const host = {
    current: deps.current,
    load: () => loadCourierConfig(deps.projectRoot),
    apply,
    acknowledge: (acknowledged: readonly string[]) => {
      watchSet.acknowledge(acknowledged);
      queue.forget(acknowledged);
    },
    reloadAfter: (paths: readonly string[]) => queue.request(paths),
    isStopped: () => stopped,
  };

  return {
    stop(): void {
      stopped = true;
      watchSet.stop();
    },
    settled: queue.settled,
    editsSettled: queue.exclusiveSettled,
    runExclusive: (transaction, timeoutMs, dropped) =>
      queue.exclusive(() => transaction(exclusiveContext(host, timeoutMs)), dropped),
  };
}
