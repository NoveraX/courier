import { createLogger } from "@noverax/courier";

const log = createLogger("Studio");

export interface ReloadQueue {
  /**
   * Reload once everything queued before has run. Requests that arrive while
   * a reload is still waiting join it, so a burst of saves reloads once.
   */
  request(changed: readonly string[]): void;
  /**
   * Run `task` alone: after everything queued before it, and before every
   * reload requested while it runs. An edit whose `dropped` signal aborts
   * before it starts stops counting as under way; the task still runs and
   * must see for itself that it was dropped.
   */
  exclusive<TResult>(task: () => Promise<TResult>, dropped?: AbortSignal): Promise<TResult>;
  /**
   * Run `task` once everything queued before it has run. It is not an edit,
   * and a reload still waiting to start runs before it, together with what
   * is requested meanwhile. A task that throws is logged and the chain goes on.
   */
  run(task: () => Promise<void>): void;
  /**
   * Refuse every edit that has not started, and every edit asked for from
   * now on: each rejects at once with what `refusal` returns, never runs,
   * and stops counting as under way. An edit already running goes on.
   */
  refuseEdits(refusal: () => Error): void;
  /** Drop paths from every reload waiting to run, as already seen. */
  forget(paths: readonly string[]): void;
  /** Resolves once nothing is queued or running. */
  settled(): Promise<void>;
  /**
   * Resolves once everything queued up to now has run, the first load
   * included; what is queued later is not waited for, so saves that keep
   * coming cannot hold it the way they hold `settled`. It never rejects.
   */
  tail(): Promise<void>;
  /** Resolves once no task run with `exclusive` is queued or running; reloads may still be. */
  exclusiveSettled(): Promise<void>;
}

/**
 * Serialize reloads and edits on one chain.
 *
 * Each reload reads the files as they are when it starts, and none starts
 * before the previous one has finished: two loads in flight at once could
 * finish out of order, and the older result would then replace the newer.
 *
 * The chain starts behind `first`, the first load. It is not an edit, so
 * `exclusiveSettled` does not wait for it. A task that throws is logged and
 * the chain goes on: a reload requested after it still runs.
 *
 * @param reload - Loads the config and applies it; reports its own failures
 * @param first - The first load, which everything else queues behind
 * @returns The queue
 *
 * @example
 * ```ts
 * const queue = createReloadQueue((changed) => reloadFor(changed), () => loadFirst());
 * queue.request(["/app/courier.config.ts"]);
 * ```
 */
export function createReloadQueue(
  reload: (changed: string[]) => Promise<void>,
  first?: () => Promise<void>,
): ReloadQueue {
  let tail: Promise<void> = first
    ? Promise.resolve()
        .then(first)
        .catch((err: unknown) => log.error("Studio could not finish loading the project", err))
    : Promise.resolve();
  /* The reload queued and not yet started, which new requests join. */
  let waiting: Set<string> | null = null;
  /* Every reload queued and not yet started: an edit's acknowledgement
     reaches each, however many edits were queued in between. */
  const notStarted = new Set<Set<string>>();
  /* Edits queued or running, less those dropped before they started, and a
     signal that wakes whoever waits for them when the set shrinks. */
  const liveEdits = new Set<Promise<void>>();
  let editsChanged = Promise.withResolvers<void>();
  /* Once set, what every edit that has not started is refused with. */
  let refusal: (() => Error) | null = null;
  /* Each edit queued and not started: how to refuse it, and its settling. */
  const queuedEdits = new Map<PromiseWithResolvers<never>, Promise<void>>();
  const dropEdit = (edit: Promise<void>) => {
    if (!liveEdits.delete(edit)) return;
    editsChanged.resolve();
    editsChanged = Promise.withResolvers<void>();
  };

  function request(changed: readonly string[]): void {
    if (waiting) {
      for (const path of changed) waiting.add(path);
      return;
    }
    const paths = new Set(changed);
    waiting = paths;
    notStarted.add(paths);
    tail = tail.then(async () => {
      if (waiting === paths) waiting = null;
      notStarted.delete(paths);
      if (paths.size === 0) return;
      await reload([...paths]).catch((err: unknown) => log.error("Studio could not reload", err));
    });
  }

  function exclusive<TResult>(
    task: () => Promise<TResult>,
    dropped?: AbortSignal,
  ): Promise<TResult> {
    if (refusal !== null) return Promise.reject(refusal());
    waiting = null;
    let started = false;
    const refused = Promise.withResolvers<never>();
    const turn = tail.then(() => {
      queuedEdits.delete(refused);
      if (refusal !== null) throw refusal();
      started = true;
      return task();
    });
    const settledEdit = turn.then(
      () => undefined,
      () => undefined,
    );
    tail = settledEdit;
    liveEdits.add(settledEdit);
    queuedEdits.set(refused, settledEdit);
    void settledEdit.then(() => dropEdit(settledEdit));
    dropped?.addEventListener("abort", () => {
      if (!started) dropEdit(settledEdit);
    });
    return Promise.race([turn, refused.promise]);
  }

  function refuseEdits(refuse: () => Error): void {
    refusal = refuse;
    for (const [refused, edit] of queuedEdits) {
      refused.reject(refuse());
      dropEdit(edit);
    }
    queuedEdits.clear();
  }

  function run(task: () => Promise<void>): void {
    tail = tail
      .then(task)
      .catch((err: unknown) =>
        log.error("Studio could not finish a task on the reload chain", err),
      );
  }

  function forget(paths: readonly string[]): void {
    for (const queued of notStarted) for (const path of paths) queued.delete(path);
  }

  async function settled(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = tail;
      await seen;
    } while (seen !== tail);
  }

  async function exclusiveSettled(): Promise<void> {
    while (liveEdits.size > 0) await Promise.race([...liveEdits, editsChanged.promise]);
  }

  return {
    request,
    exclusive,
    run,
    refuseEdits,
    forget,
    settled,
    tail: () => tail,
    exclusiveSettled,
  };
}
