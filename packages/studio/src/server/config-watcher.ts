/**
 * The engine that loads the project: `courier.config.ts`, `courier.mocks.ts`
 * and every module they transitively import.
 *
 * Every load runs on one chain, one at a time and in order: the first, each
 * reload after a change, and each edit an exclusive transaction makes. The
 * outcome of each goes to the owner through `onApplied` or `onFailed`, in the
 * order the loads ran. After the first outcome the watch set is armed; every
 * load that succeeds re-arms it with the modules it read, so a module the
 * config has only just started importing is watched from that moment, and a
 * load that fails adds what it read. An import that named no module when the
 * load read it is watched at every path its module could be created at. Each
 * file is compared then with the bytes the load read before evaluating, so a
 * save made while the load ran — before anything watched that file — is
 * reloaded as soon as it ends.
 *
 * The comparison is with the bytes the dependency walk read, not the ones
 * evaluated after it. A file nothing watched when the load started — on the
 * first load, or a module a reload is first to import — that is saved and
 * then restored to the bytes the walk read, both while the load runs, can
 * leave Studio running the version in between until that file changes
 * again. A file already watched is covered by its notifications, which is
 * also why a save whose notification is still waiting when a load reads it
 * is loaded once more: the notification may stand for a version the load
 * evaluated in place of the bytes its walk read.
 *
 * A load that runs past the timeout is given up, so a config that awaits
 * something that never comes does not hold every reload and edit behind it
 * for good; it fails with `CONFIG_LOAD_TIMEOUT`, and what it read is armed
 * like any failed load's. When it succeeds after all, Studio runs it only if
 * its failure is still the latest outcome once everything queued before has
 * run, and every file it read still holds what it read; otherwise the config
 * is loaded once more, and a newer outcome is never replaced. When it fails
 * after all, what it threw replaces the timeout on the same terms, as any
 * failed load's outcome would, so the real cause is reported.
 */

import { createLogger } from "@noverax/courier";
import { armWatchSet } from "./arm-watch-set";
import { createChainLoad } from "./chain-load";
import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
import { ConfigLoaderError } from "./config-loader-errors";
import { type ExclusiveTransaction, exclusiveContext } from "./exclusive-reload";
import { inputsOnDisk } from "./inputs-on-disk";
import { CONFIG_LOAD_TIMEOUT_MS } from "./project-state/budgets";
import type { ProjectInputs } from "./read-project-inputs";
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
  /** How long the first load and each reload may take (default: `CONFIG_LOAD_TIMEOUT_MS`). */
  loadTimeoutMs?: number;
}

export interface ConfigWatcher {
  /** Release every watch; outcomes of loads still running are dropped. */
  stop(): void;
  /** Resolves once no load is queued or running, the first load included. */
  settled(): Promise<void>;
  /** Resolves once no edit run with `runExclusive` is queued or running. */
  editsSettled(): Promise<void>;
  /**
   * Refuse every edit that has not started, and every later one, with
   * `CONFIG_WATCHER_STOPPED`, so none writes a file once Studio is stopping;
   * an edit under way goes on.
   */
  refuseEdits(): void;
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

/** What an edit is refused with once Studio is stopping. */
function stopping(): ConfigLoaderError {
  return new ConfigLoaderError("CONFIG_WATCHER_STOPPED", "Studio is stopping, so it made no edit");
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
  /* The latest outcome: the load applied, or what the failed one threw. */
  let latest: unknown = null;
  /* What the load running on the chain read, handed over before it
     evaluates, so a load that fails in any way still arms what it read. */
  let read: ProjectInputs | null = null;
  const chain = createChainLoad({
    projectRoot: deps.projectRoot,
    timeoutMs: deps.loadTimeoutMs ?? CONFIG_LOAD_TIMEOUT_MS,
    onInputs: (inputs) => {
      read = inputs;
    },
    onLateSuccess: (loaded, gaveUp) =>
      late(gaveUp, () => {
        if (inputsOnDisk(loaded.depHashes)) apply(loaded);
        else queue.request([loaded.configFile]);
      }),
    onLateFailure: (error, gaveUp) => late(gaveUp, () => fail(gaveUp.depHashes ?? null, error)),
  });
  const queue = createReloadQueue(reload, load);
  const watchSet = createWatchSet({
    paths: [],
    onChange: (changed) => queue.request(changed),
    onDegraded: reportDegradation,
  });
  const arming = armWatchSet(watchSet, deps);

  function apply(loaded: LoadedCourierConfig): void {
    latest = loaded;
    arming.succeeded(loaded);
    deps.onApplied(loaded);
  }

  function fail(inputs: ProjectInputs | null, error: unknown): void {
    latest = error;
    arming.failed(inputs, error);
    deps.onFailed(error);
  }

  async function load(): Promise<void> {
    if (stopped) return;
    read = null;
    let loaded: LoadedCourierConfig;
    try {
      loaded = await chain.load();
    } catch (err) {
      if (!stopped) fail(read, err);
      return;
    }
    /* A stop while it loaded must not push a config into a server that has
       already torn its state down. */
    if (!stopped) apply(loaded);
  }

  /* Decided on the chain, after what was queued before: a load queued then
     has an outcome of its own by the time this runs. */
  function late(gaveUp: unknown, take: () => void): void {
    if (stopped || latest !== gaveUp) return;
    queue.run(async () => {
      if (!stopped && latest === gaveUp) take();
    });
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
    refuseEdits: () => queue.refuseEdits(stopping),
    runExclusive: (transaction, timeoutMs, dropped) =>
      queue.exclusive(() => transaction(exclusiveContext(host, timeoutMs)), dropped),
  };
}
