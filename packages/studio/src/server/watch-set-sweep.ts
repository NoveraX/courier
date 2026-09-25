import { type FileSignature, signatureOf } from "./file-signature";
import { lastModifiedAt } from "./last-modified-at";

/** What a sweep reads from a watch set's ledger, and reports through it. */
export interface WatchSetSweepOptions {
  /** How long a burst of changes is left to settle before it is reported. */
  debounceMs: number;
  /** Each watched path whose state now differs from the one last reported, with that state. */
  unreported(): ReadonlyMap<string, FileSignature>;
  /** The paths whose change is waiting out the debounce. */
  waiting(): Iterable<string>;
  /** Report these changes now, together with every change still waiting. */
  report(changes: ReadonlyMap<string, FileSignature>): void;
}

/** One comparison of every watched path with the disk at a time. */
export interface WatchSetSweep {
  /**
   * Compare and report, waiting for saves in progress until `until` at most.
   *
   * @param until - When to stop waiting for saves in progress, in epoch milliseconds
   * @returns `true` once what changed is reported; `false` when saves were
   *   still in progress at `until`, or the sweep was stopped, and it reported nothing
   */
  run(until: number): Promise<boolean>;
  /** Report nothing more; a sweep under way resolves `false` at once. */
  stop(): void;
}

interface Pass {
  done: PromiseWithResolvers<boolean>;
  until: number;
}

/**
 * Compare every watched path with the disk and report what changed, without
 * waiting out the debounce — unless a change may be a save still in
 * progress: a path whose timestamp is within the last debounce, or that
 * changed again while it was compared. A save made in two steps (truncated
 * then written, renamed away then written anew), or a burst of saves across
 * files (a code generator, a branch switch), is then read once it is whole:
 * the sweep compares again one debounce later, for as long as its callers
 * wait. Reporting part of it would load the files half-written, and every UI
 * would be told of a load that fails. When the wait runs out first, it
 * reports nothing and says so; the debounce reports those saves once they
 * stop.
 *
 * A sweep starts on the next turn of the event loop, and every caller until
 * it reports shares it, waiting until the latest of their deadlines: its last
 * comparison reads the disk after each of them asked, and a burst of
 * requests hashes the watched files once.
 *
 * @param options - The debounce, and the ledger it reads and reports through
 * @returns The sweep
 *
 * @example
 * ```ts
 * const sweep = createWatchSetSweep({ debounceMs: 100, unreported, waiting, report });
 * const reported = await sweep.run(Date.now() + 3_000);
 * ```
 */
export function createWatchSetSweep(options: WatchSetSweepOptions): WatchSetSweep {
  const { debounceMs, unreported, waiting, report } = options;
  let current: Pass | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function compare(): void {
    const pass = current;
    if (pass === null) return;
    try {
      const changes = unreported();
      if (inProgress(changes)) {
        if (Date.now() + debounceMs <= pass.until) {
          timer = setTimeout(compare, debounceMs);
          return;
        }
        current = null;
        pass.done.resolve(false);
        return;
      }
      current = null;
      report(changes);
      pass.done.resolve(true);
    } catch (error) {
      current = null;
      pass.done.reject(error);
    }
  }

  function inProgress(changes: ReadonlyMap<string, FileSignature>): boolean {
    const now = Date.now();
    for (const path of [...changes.keys(), ...waiting()]) {
      if (now - lastModifiedAt(path) < debounceMs) return true;
    }
    for (const [path, signature] of changes) {
      if (signatureOf(path).key !== signature.key) return true;
    }
    return false;
  }

  return {
    run(until: number): Promise<boolean> {
      if (stopped) return Promise.resolve(false);
      if (current === null) {
        current = { done: Promise.withResolvers<boolean>(), until };
        setImmediate(compare);
      }
      current.until = Math.max(current.until, until);
      return current.done.promise;
    },
    stop(): void {
      stopped = true;
      clearTimeout(timer);
      const pass = current;
      current = null;
      pass?.done.resolve(false);
    },
  };
}
