import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
import { ConfigLoaderError } from "./config-loader-errors";
import { type ExclusiveTransaction, exclusiveContext } from "./exclusive-reload";
import { type EditMark, insideEdit } from "./project-state/inside-edit";
import type { ReloadQueue } from "./reload-queue";
import type { WatchSet } from "./watch-set";

/** What the engine lends the edits it runs on its reload chain. */
export interface EditRunnerOptions {
  /** The project root, symlinks resolved. */
  projectRoot: string;
  /** The chain every load and edit runs on. */
  queue: Pick<ReloadQueue, "exclusive" | "forget" | "refuseEdits" | "request">;
  /** The engine's watch set, told which writes an edit has already seen. */
  watchSet: Pick<WatchSet, "acknowledge">;
  /** What Studio runs now. */
  current(): LoadedCourierConfig | null;
  /** Make a load what Studio runs, as a reload would. */
  apply(loaded: LoadedCourierConfig): void;
  /** Whether Studio is stopping. */
  isStopped(): boolean;
}

/** The edits an engine runs, and how it stops taking them. */
export interface EditRunner {
  /**
   * Run an edit alone on the chain, marked as inside an edit for as long as
   * it runs (see `insideEdit`).
   *
   * @param transaction - The edit
   * @param timeoutMs - How long one `load` inside it may take
   * @param dropped - Aborted when the caller gave up before the edit started
   */
  runExclusive<TResult>(
    transaction: ExclusiveTransaction<TResult>,
    timeoutMs: number,
    dropped?: AbortSignal,
  ): Promise<TResult>;
  /** Refuse every edit that has not started, and every later one, with `CONFIG_WATCHER_STOPPED`. */
  refuseEdits(): void;
}

/** What an edit is refused with once Studio is stopping. */
function stopping(): ConfigLoaderError {
  return new ConfigLoaderError("CONFIG_WATCHER_STOPPED", "Studio is stopping, so it made no edit");
}

/**
 * Run edits of the watched files on the engine's reload chain.
 *
 * Each edit runs inside `insideEdit`, so a read that would wait for the
 * chain refuses at once instead of waiting for the edit that made it; the
 * mark stops counting once the edit returns, so a callback the edit left
 * behind reads like any other. What the edit applies and the reloads it
 * asks for outlive it, so they run outside that mark: the watches and
 * timers they start belong to no edit.
 *
 * @param options - The chain, the watch set, and what Studio runs
 * @returns How to run an edit, and how to refuse them once Studio stops
 *
 * @example
 * ```ts
 * const edits = createEditRunner({ projectRoot, queue, watchSet, current, apply, isStopped });
 * await edits.runExclusive(async (tx) => tx.apply(await tx.load()), CONFIG_LOAD_TIMEOUT_MS);
 * ```
 */
export function createEditRunner(options: EditRunnerOptions): EditRunner {
  const { projectRoot, queue, watchSet } = options;
  const host = {
    current: options.current,
    load: () => loadCourierConfig(projectRoot),
    apply: (loaded: LoadedCourierConfig) => insideEdit.exit(() => options.apply(loaded)),
    acknowledge: (acknowledged: readonly string[]) => {
      watchSet.acknowledge(acknowledged);
      queue.forget(acknowledged);
    },
    reloadAfter: (paths: readonly string[]) => insideEdit.exit(() => queue.request(paths)),
    isStopped: options.isStopped,
  };

  async function marked<TResult>(run: () => Promise<TResult>): Promise<TResult> {
    const mark: EditMark = { running: true };
    try {
      return await insideEdit.run(mark, run);
    } finally {
      mark.running = false;
    }
  }

  return {
    runExclusive: (transaction, timeoutMs, dropped) =>
      queue.exclusive(() => marked(() => transaction(exclusiveContext(host, timeoutMs))), dropped),
    refuseEdits: () => queue.refuseEdits(stopping),
  };
}
