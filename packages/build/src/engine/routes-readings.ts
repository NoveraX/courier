import { fingerprintOf, UNSETTLED } from "./fingerprint";
import { RoutesReadError } from "./routes-read-error";
import type { RoutesInputs, RoutesSnapshot } from "./routes-snapshot";

/** What one reading of the routes gave: the routes, or why there are none. */
export type ReadingOutcome =
  | { readonly ok: true; readonly snapshot: RoutesSnapshot }
  | { readonly ok: false; readonly error: unknown };

/** The routes the latest successful reading gave, and the digest of what it depended on as it ended. */
export interface KeptReading {
  readonly snapshot: RoutesSnapshot;
  /** {@link UNSETTLED} when something it read changed while it ran. */
  readonly fingerprint: string;
}

/** The readings of one project's routes, made one at a time. */
export interface Readings {
  /**
   * An outcome for a caller asking now: the routes kept while nothing they
   * depended on has changed; otherwise a reading begun after the call, or
   * one it joined during which nothing it read changed.
   */
  next(): Promise<ReadingOutcome>;
  /** The routes the latest successful reading gave. */
  readonly kept: KeptReading | undefined;
}

/* A caller waiting for an outcome, and how many readings had begun when it asked. */
interface Waiter {
  readonly seen: number;
  readonly settle: (outcome: ReadingOutcome) => void;
}

/**
 * Make the readings of a project's routes one at a time. Callers that ask
 * while one runs share it, unless something it read changed while it ran:
 * a caller that asked after it began then gets the next reading, which
 * begins after the change, so an edit saved mid-reading is never served
 * stale. A failure is not kept: the next caller reads again.
 *
 * @param read - One reading
 * @returns The readings
 * @example
 * ```ts
 * const readings = createReadings(() => evaluateInChild(request));
 * const outcome = await readings.next();
 * ```
 */
export function createReadings(read: () => Promise<RoutesSnapshot>): Readings {
  let kept: KeptReading | undefined;
  let begun = 0;
  let running = false;
  let waiting: Waiter[] = [];
  const run = async (): Promise<void> => {
    running = true;
    while (waiting.length > 0) {
      begun += 1;
      const reading = begun;
      const since = Date.now();
      const outcome = await outcomeOf(read);
      const inputs = inputsOf(outcome);
      const fingerprint = inputs === undefined ? UNSETTLED : fingerprintOf(inputs, since);
      if (outcome.ok) kept = { snapshot: outcome.snapshot, fingerprint };
      /* One that read nothing tells nothing of changes: it is everyone's. */
      const settled = fingerprint !== UNSETTLED || inputs === undefined;
      const served = waiting.filter((waiter) => settled || waiter.seen < reading);
      waiting = waiting.filter((waiter) => !served.includes(waiter));
      for (const waiter of served) waiter.settle(outcome);
    }
    running = false;
  };
  return {
    next() {
      if (kept !== undefined && isCurrent(kept)) {
        return Promise.resolve({ ok: true, snapshot: kept.snapshot });
      }
      return new Promise((settle) => {
        waiting.push({ seen: begun, settle });
        if (!running) void run();
      });
    },
    get kept() {
      return kept;
    },
  };
}

/* Whether nothing the kept routes depended on has changed since they were read. */
function isCurrent(kept: KeptReading): boolean {
  return kept.fingerprint !== UNSETTLED && fingerprintOf(kept.snapshot) === kept.fingerprint;
}

/* The routes, or what was thrown: the reading is the evaluator's, which may throw anything. */
async function outcomeOf(read: () => Promise<RoutesSnapshot>): Promise<ReadingOutcome> {
  try {
    return { ok: true, snapshot: await read() };
  } catch (error) {
    return { ok: false, error };
  }
}

/* What a reading had read: all of it for routes, what a failure reports, or nothing known. */
function inputsOf(outcome: ReadingOutcome): RoutesInputs | undefined {
  if (outcome.ok) return outcome.snapshot;
  return outcome.error instanceof RoutesReadError ? outcome.error.inputs : undefined;
}
