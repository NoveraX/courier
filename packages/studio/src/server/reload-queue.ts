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
   * reload requested while it runs.
   */
  exclusive<TResult>(task: () => Promise<TResult>): Promise<TResult>;
  /** Drop paths from the reload waiting to run, as already seen. */
  forget(paths: readonly string[]): void;
  /** Resolves once nothing is queued or running. */
  settled(): Promise<void>;
}

/**
 * Serialize reloads and edits on one chain.
 *
 * Each reload reads the files as they are when it starts, and none starts
 * before the previous one has finished: two loads in flight at once could
 * finish out of order, and the older result would then replace the newer.
 *
 * @param reload - Loads the config and applies it; reports its own failures
 * @returns The queue
 */
export function createReloadQueue(reload: (changed: string[]) => Promise<void>): ReloadQueue {
  let tail: Promise<void> = Promise.resolve();
  /* The reload queued and not yet started, which new requests join. */
  let waiting: Set<string> | null = null;

  function request(changed: readonly string[]): void {
    if (waiting) {
      for (const path of changed) waiting.add(path);
      return;
    }
    const paths = new Set(changed);
    waiting = paths;
    tail = tail.then(async () => {
      if (waiting === paths) waiting = null;
      if (paths.size === 0) return;
      await reload([...paths]).catch((err: unknown) => log.error("Studio could not reload", err));
    });
  }

  function exclusive<TResult>(task: () => Promise<TResult>): Promise<TResult> {
    waiting = null;
    const result = tail.then(task);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  function forget(paths: readonly string[]): void {
    if (!waiting) return;
    for (const path of paths) waiting.delete(path);
  }

  async function settled(): Promise<void> {
    let seen: Promise<void>;
    do {
      seen = tail;
      await seen;
    } while (seen !== tail);
  }

  return { request, exclusive, forget, settled };
}
