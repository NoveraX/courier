import { retryDelay } from "./retry-delay";

/** A job run one run at a time. */
export interface SerialRuns {
  /** Run it now, or once more after the run going on */
  now(): void;
  /** Run it in a microtask, once for every call made until then */
  soon(): void;
  /** Run it no more: a run waiting to be tried again is dropped, and one going on finishes */
  stop(): void;
}

/**
 * Run a job that sends Redis commands one run at a time, so that each run
 * sees what Redis answered the one before it: a run asked for while one
 * goes on follows it, once for every one asked meanwhile, and a run Redis
 * failed is tried again after a pause that grows with each failure in a
 * row.
 *
 * @param run - Sends the commands of one run, settling once Redis has answered each; `undefined` when there is nothing to send
 * @param report - Told of each run Redis failed
 * @param random - A source of numbers in [0, 1), for the pauses
 * @returns The job, not run yet
 * @example
 * ```ts
 * const reconciling = createSerialRuns(reconcile, report);
 * subscriber.on("ready", reconciling.now);
 * ```
 */
export function createSerialRuns(
  run: () => Promise<unknown> | undefined,
  report: (error: Error) => void,
  random: () => number = Math.random,
): SerialRuns {
  let running = false;
  let again = false;
  let queued = false;
  let stopped = false;
  let failures = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function now(): void {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    /* Going on from before its first command is sent: a run asked for meanwhile follows it. */
    running = true;
    const sent = run();
    if (!sent) {
      running = false;
      return;
    }
    sent
      .then(
        () => {
          failures = 0;
        },
        (error: unknown) => {
          report(error instanceof Error ? error : new Error(String(error)));
          tryAgainLater();
        },
      )
      .finally(() => {
        running = false;
        if (!again) return;
        again = false;
        now();
      });
  }

  function tryAgainLater(): void {
    if (retry !== undefined || stopped) return;
    retry = setTimeout(
      () => {
        retry = undefined;
        now();
      },
      retryDelay(failures++, random),
    );
    if (typeof retry === "object" && "unref" in retry) retry.unref();
  }

  return {
    now,
    soon() {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        now();
      });
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
    },
  };
}
