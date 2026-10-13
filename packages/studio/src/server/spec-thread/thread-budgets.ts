import type { ResourceLimits } from "node:worker_threads";

/** How long, and with how much memory, Studio gives one job in a thread. */
export interface ThreadBudget {
  ms: number;
  heapMb: number;
}

/**
 * The least heap a thread is given. Its script needs some to load, and a
 * thread given less than 3 MB does not fail alone: V8 aborts the whole
 * process as the thread starts.
 */
export const MIN_THREAD_HEAP_MB = 32;

/**
 * The young generation of each thread. V8 sizes it from the heap by
 * default, which cost a thread up to 200 MB of memory beside its heap; at
 * 16 MB a specification reads as fast, and two reads of 5 MB of YAML at
 * the visitor's budget took 550 MB together instead of 770.
 */
export const THREAD_YOUNG_MB = 16;

/** A caller with the project's token: its own project's specifications, the largest there are. */
export const TRUSTED_JOB: ThreadBudget = { ms: 120_000, heapMb: 4096 };

/*
 * A caller without it, measured with two jobs at once, as Studio runs at
 * most for such callers. Within 256 MB of heap a thread reads JSON of
 * 16 MB, YAML of 6 MB written as specifications are, and a mapping of
 * 200,000 bare keys, 2.4 MB; it generates the code of real APIs' whole
 * specifications — Stripe's 612 operations, GitHub's 1,232 — though not of
 * one with tens of thousands, and compares two of 15 MB. Two such jobs add
 * at most some 560 MB to the process, whatever the text and however it is
 * shaped — a text that needs more is refused — against more than 1 GB at
 * 512 MB.
 */

/** Reading a specification for a caller without the token: JSON of 16 MB, and YAML of a few megabytes. */
export const VISITOR_READ: ThreadBudget = { ms: 20_000, heapMb: 256 };

/** Generating code for a caller without the token, from a specification as large as Studio reads for one. */
export const VISITOR_GENERATE: ThreadBudget = { ms: 20_000, heapMb: 256 };

/** Comparing two specifications for a caller without the token, which together make one request's body. */
export const VISITOR_DIFF: ThreadBudget = { ms: 20_000, heapMb: 256 };

/**
 * The limits a thread is started with for a budget.
 *
 * @param budget - The job's time and heap
 * @returns The thread's resource limits
 * @throws {RangeError} For a time that is not a positive number of milliseconds, or less heap than {@link MIN_THREAD_HEAP_MB}
 * @example
 * ```ts
 * new Worker(script, { resourceLimits: threadLimits(VISITOR_READ) });
 * ```
 */
export function threadLimits({ ms, heapMb }: ThreadBudget): ResourceLimits {
  if (!(ms > 0) || !Number.isFinite(ms)) {
    throw new RangeError(`A thread's job needs a time of more than 0 ms; it was given ${ms}.`);
  }
  if (!(heapMb >= MIN_THREAD_HEAP_MB) || !Number.isFinite(heapMb)) {
    throw new RangeError(
      `A thread needs at least ${MIN_THREAD_HEAP_MB} MB of heap; it was given ${heapMb} MB.`,
    );
  }
  return { maxOldGenerationSizeMb: heapMb, maxYoungGenerationSizeMb: THREAD_YOUNG_MB };
}
