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
 * load read it is watched at every path its module could be created at, and
 * one that did at every path the loader would take first, such as a compiled
 * `api.js` beside the `api.ts` it runs. Each
 * file is compared then with the bytes the load read before evaluating, so a
 * save made while the load ran — before anything watched that file — is
 * reloaded as soon as it ends.
 *
 * A module the loader transpiled — the config, the mocks file and what
 * they import — is also compared with the text the load evaluated from it,
 * so one evaluated from other bytes than the walk read is reloaded once
 * more, even when a second save restored the bytes the walk read before
 * anything watched it. A change reported for files that each hold, by the
 * time it is taken, exactly the text Studio runs reloads nothing: an editor
 * saving a file unchanged, or an edit undone before the reload ran. A file
 * Node runs itself — JSON, a native JavaScript module — and a `tsconfig`
 * are compared with the bytes the walk read alone, and always reload.
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
 *
 * A reader that must see the saves already on disk catches up: the watched
 * files are compared with the disk at once rather than after the debounce,
 * and what that queues is waited for — but not what is queued after it.
 * Saves still being written are waited for until the reader's deadline;
 * past it, the reader is told Studio has not caught up.
 */

import { relative } from "node:path";

import { createLogger } from "@noverax/courier";
import { armWatchSet } from "./arm-watch-set";
import { createChainLoad } from "./chain-load";
import type { LoadedCourierConfig } from "./config-loader";
import { createEditRunner } from "./edit-runner";
import { watchProjectEnv } from "./env-watch";
import type { ExclusiveTransaction } from "./exclusive-context";
import { inputsOnDisk } from "./inputs-on-disk";
import type { ProjectEnv } from "./project-env";
import { CONFIG_LOAD_TIMEOUT_MS } from "./project-state/budgets";
import type { ProjectInputs } from "./read-project-inputs";
import { createReloadQueue } from "./reload-queue";
import { runsWhatChangedHolds } from "./runs-what-changed-holds";
import { createWatchSet, type WatchDegradation } from "./watch-set";
import type { WatcherStatus } from "./watcher-status";

const log = createLogger("Studio");

export interface ConfigWatcherDeps {
  /** The project root, symlinks resolved. */
  projectRoot: string;
  /** Told the watched count and each change. */
  watcherStatus?: WatcherStatus | undefined;
  /** What Studio runs now, lent to exclusive edits. */
  current(): LoadedCourierConfig | null;
  /** A load succeeded; Studio runs it from now on. Called in chain order. */
  onApplied(loaded: LoadedCourierConfig): void;
  /** A load failed; Studio keeps running what it ran. Called in chain order. */
  onFailed(error: unknown): void;
  /** How long the first load and each reload may take (default: `CONFIG_LOAD_TIMEOUT_MS`). */
  loadTimeoutMs?: number;
  /** The project's variables, read again — and the config with them — when their files change. */
  env?: ProjectEnv | undefined;
}

export interface ConfigWatcher {
  /** Release every watch; outcomes of loads still running are dropped. */
  stop(): void;
  /** Resolves once no load is queued or running, the first load included. */
  settled(): Promise<void>;
  /**
   * Resolves once Studio runs what was on disk when it was called: after the
   * first outcome, every watched file is compared with the disk and each
   * that changed is reported at once (see `WatchSet.sweep`), and then what
   * the chain holds at that moment runs — a reload of those files included,
   * but nothing queued after it, so saves that keep coming do not hold it.
   * It never rejects. Called from inside an edit it would wait for that edit.
   *
   * @param until - How long saves still being written are waited for, in epoch milliseconds
   * @returns `true` once caught up; `false` when saves were still being
   *   written at `until`, or the files could not be compared with the disk,
   *   so Studio is not known to run what is on disk
   */
  catchUp(until: number): Promise<boolean>;
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

/** A refused watch leaves the comparison pass running, so say so rather than throw. */
function reportDegradation({ kind, path, message }: WatchDegradation): void {
  const advice =
    kind === "limit" ? " Raise fs.inotify.max_user_watches to restore native notifications." : "";
  log.warn(
    `Cannot watch ${path}: ${message}. Studio compares it with the disk every half second instead.${advice}`,
  );
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
  /* The chain holds nothing but the first load yet. */
  const started = queue.tail();
  const watchSet = createWatchSet({
    paths: [],
    onChange: (changed) => queue.request(changed),
    onDegraded: reportDegradation,
  });
  const arming = armWatchSet(watchSet, deps);
  const envWatch = watchProjectEnv(deps, queue.request, reportDegradation);

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

  async function catchUp(until: number): Promise<boolean> {
    await started;
    try {
      if (!(await watchSet.sweep(until))) return false;
      if (envWatch && !(await envWatch.sweep(until))) return false;
    } catch (error) {
      log.warn("Studio could not compare the files it watches with the disk", error);
      return false;
    }
    await queue.tail();
    return true;
  }

  async function reload(changed: string[]): Promise<void> {
    if (stopped) return;
    /* On the chain, so a load reads the variables whole: those of before, or those of after. */
    if (envWatch?.settles(changed)) return;
    if (latest === deps.current() && runsWhatChangedHolds(deps.current(), changed)) return;
    /* The page shows these; the project root says where they are. */
    deps.watcherStatus?.emitChange(
      "api",
      changed.map((file) => relative(deps.projectRoot, file) || "."),
    );
    await load();
  }

  const edits = createEditRunner({
    projectRoot: deps.projectRoot,
    queue,
    watchSet,
    current: deps.current,
    apply,
    isStopped: () => stopped,
  });

  return {
    stop(): void {
      stopped = true;
      watchSet.stop();
      envWatch?.stop();
    },
    settled: queue.settled,
    catchUp,
    editsSettled: queue.exclusiveSettled,
    refuseEdits: edits.refuseEdits,
    runExclusive: edits.runExclusive,
  };
}
