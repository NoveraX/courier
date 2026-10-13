/** How long, and with how much memory, Studio gives one job in its process. */
export interface JobBudget {
  ms: number;
  heapMb: number;
}

/**
 * The least heap a job's process is given: the spec worker script needs
 * some to load what it reads, generates and compares with.
 */
export const MIN_JOB_HEAP_MB = 32;

/**
 * Each semi-space of a job's young generation. V8 sizes it from the heap by
 * default, which cost a job's process some 100 MB beside its heap; at 8 MB
 * a specification reads as fast, and two reads of 6 MB of YAML at the
 * visitor's budget took 660 MB together on Linux instead of 840.
 */
export const JOB_SEMI_SPACE_MB = 8;

/** A caller with the project's token: its own project's specifications, the largest there are. */
export const TRUSTED_JOB: JobBudget = { ms: 120_000, heapMb: 4096 };

/*
 * A caller without it, measured with two jobs at once, as Studio runs at
 * most for such callers. Within 256 MB of heap a process reads JSON of
 * 16 MB, YAML of 6 MB written as specifications are, and a mapping of
 * 200,000 bare keys, 2.4 MB; it generates the code of real APIs' whole
 * specifications — Stripe's 612 operations, GitHub's 1,232 — and of one
 * with 12,000, though not of one with 30,000, and compares two of 16 MB. A
 * text that needs more is refused, its process stopped. Two processes
 * reading take at most some 680 MB together on Linux, whatever the text
 * and however it is shaped; generating code takes memory beyond its heap
 * as well, and two refused at 30,000 operations had taken up to 1.6 GB.
 */

/** Reading a specification for a caller without the token: JSON of 16 MB, and YAML of a few megabytes. */
export const VISITOR_READ: JobBudget = { ms: 20_000, heapMb: 256 };

/** Generating code for a caller without the token, from a specification as large as Studio reads for one. */
export const VISITOR_GENERATE: JobBudget = { ms: 20_000, heapMb: 256 };

/** Comparing two specifications for a caller without the token, which together make one request's body. */
export const VISITOR_DIFF: JobBudget = { ms: 20_000, heapMb: 256 };

/**
 * The Node flags a job's process starts with for its budget: its heap, and
 * its young generation. Its time is kept by Studio, which stops the process
 * once it is spent.
 *
 * @param budget - The job's time and heap
 * @returns The flags
 * @throws {RangeError} For a time that is not a positive number of milliseconds, or less heap than {@link MIN_JOB_HEAP_MB}
 * @example
 * ```ts
 * jobFlags(VISITOR_READ); // ["--max-old-space-size=256", "--max-semi-space-size=8"]
 * ```
 */
export function jobFlags({ ms, heapMb }: JobBudget): string[] {
  if (!(ms > 0) || !Number.isFinite(ms)) {
    throw new RangeError(`A job needs a time of more than 0 ms; it was given ${ms}.`);
  }
  if (!(heapMb >= MIN_JOB_HEAP_MB) || !Number.isFinite(heapMb)) {
    throw new RangeError(
      `A job's process needs at least ${MIN_JOB_HEAP_MB} MB of heap; it was given ${heapMb} MB.`,
    );
  }
  return [`--max-old-space-size=${heapMb}`, `--max-semi-space-size=${JOB_SEMI_SPACE_MB}`];
}
