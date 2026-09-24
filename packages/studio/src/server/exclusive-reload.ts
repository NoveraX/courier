import type { LoadedCourierConfig } from "./config-loader";
import { ConfigLoaderError } from "./config-loader-errors";

/** What an edit of the watched files can do while it holds the reload chain. */
export interface ExclusiveContext {
  /** The config and mocks Studio runs now. */
  current(): LoadedCourierConfig | null;
  /**
   * Load the config and the mocks file as they are on disk now. Nothing
   * changes until the result is passed to `apply`.
   *
   * @throws ConfigLoaderError `CONFIG_LOAD_TIMEOUT` when it takes too long,
   *   `CONFIG_WATCHER_STOPPED` once Studio is stopping, or what the loader threw
   */
  load(): Promise<LoadedCourierConfig>;
  /** Make a loaded result what Studio runs, exactly as a reload would. */
  apply(loaded: LoadedCourierConfig): void;
  /**
   * Take the watched files at these paths as already seen in their present
   * state, so writing them does not reload once more. Call it right after the
   * write, having checked that the bytes are the ones written.
   */
  acknowledge(paths: readonly string[]): void;
  /**
   * Reload these files once the edit is done. For a write the edit took as
   * seen and then could not take back: what is on disk is no longer what
   * Studio runs, and nothing else would notice.
   */
  reloadAfter(paths: readonly string[]): void;
}

/** An edit of the watched files, run alone on the reload chain. */
export type ExclusiveTransaction<TResult> = (ctx: ExclusiveContext) => Promise<TResult>;

/** What the watcher lends a transaction. */
export interface ExclusiveHost {
  current(): LoadedCourierConfig | null;
  load(): Promise<LoadedCourierConfig>;
  apply(loaded: LoadedCourierConfig): void;
  acknowledge(paths: readonly string[]): void;
  reloadAfter(paths: readonly string[]): void;
  isStopped(): boolean;
}

/**
 * The context a transaction runs with. A load that outlives `timeoutMs` is
 * abandoned rather than awaited: it keeps running, and its result is never
 * applied, so the transaction can undo its write before the chain moves on.
 *
 * @param host - The watcher's state and operations
 * @param timeoutMs - How long one load may take
 * @returns The context passed to the transaction
 */
export function exclusiveContext(host: ExclusiveHost, timeoutMs: number): ExclusiveContext {
  const stopped = () =>
    new ConfigLoaderError("CONFIG_WATCHER_STOPPED", "Studio stopped before the config reloaded");

  async function load(): Promise<LoadedCourierConfig> {
    if (host.isStopped()) throw stopped();
    const loaded = await withTimeout(host.load(), timeoutMs);
    if (host.isStopped()) throw stopped();
    return loaded;
  }

  return {
    current: host.current,
    load,
    apply: (loaded) => {
      if (!host.isStopped()) host.apply(loaded);
    },
    acknowledge: host.acknowledge,
    reloadAfter: host.reloadAfter,
  };
}

async function withTimeout<TValue>(work: Promise<TValue>, timeoutMs: number): Promise<TValue> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const seconds = Math.round(timeoutMs / 100) / 10;
      reject(
        new ConfigLoaderError(
          "CONFIG_LOAD_TIMEOUT",
          `The config took longer than ${seconds} s to load`,
        ),
      );
    }, timeoutMs);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    clearTimeout(timer);
  }
}
