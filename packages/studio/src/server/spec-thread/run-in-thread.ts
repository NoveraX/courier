import { Worker } from "node:worker_threads";

import { STUDIO_THREAD_SCRIPT } from "../studio-thread-script";
import { listenToThread } from "./listen-to-thread";
import type { ReplyTo, SpecJob } from "./spec-thread-protocol";
import { SpecWorkLimitError } from "./spec-work-limit-error";
import { StudioThreadError } from "./studio-thread-error";
import { type ThreadBudget, threadLimits } from "./thread-budgets";

/** How long a thread has to greet Studio once started: its script loads in tens of milliseconds. */
export const THREAD_READY_MS = 10_000;

/** A job running in a thread of its own. */
export interface ThreadRun<TReply> {
  /** The thread's reply: settles as soon as the job is done, has failed, or was stopped. */
  readonly reply: Promise<TReply>;
  /**
   * Settles once the thread has exited and its heap is freed — after
   * `reply`, by as long as that takes: tens of milliseconds for a thread
   * that ran out of time with a large heap. Never rejects.
   */
  readonly exited: Promise<void>;
}

interface Settle<TValue> {
  resolve(value: TValue): void;
  reject(reason: unknown): void;
}

/**
 * Run one job in a thread of its own, started for it and ended once it is
 * done — whichever comes first of its reply, its budget of time or memory,
 * its failure, or its caller's going — so that no specification, however
 * large and however its YAML is shaped, holds up Studio's server, and a job
 * stopped leaves nothing running. Its reply comes as soon as the job is
 * over; the thread's exit, which frees its heap, is told apart, so that
 * whoever counts the threads running counts this one until it is gone.
 *
 * The thread greets Studio before anything else with the version of what
 * it understands. One that names another version, or says nothing within
 * {@link THREAD_READY_MS}, runs a script from another build of Studio: the
 * job fails at once, saying so, rather than wait out its budget for an
 * answer that will not come.
 *
 * @param job - What to do, and what with
 * @param budget - The time and memory the job may take
 * @param signal - Aborted once its caller goes away: the thread is ended
 * @returns The thread's exit, and its reply — the job's result, or why its
 *   input has none — which rejects with {@link SpecWorkLimitError} when the
 *   job takes longer or more memory than its budget, with
 *   {@link StudioThreadError} when the thread script is from another build of
 *   Studio or missing or the thread fails, and with the signal's reason once
 *   it is aborted
 * @throws {RangeError} For a budget no thread can run within, before any thread starts
 * @throws The signal's reason, when it was aborted before any thread started
 * @example
 * ```ts
 * const { reply, exited } = runInThread({ kind: "spec:diff", oldSpec, newSpec }, VISITOR_DIFF, signal);
 * ```
 */
export function runInThread<TJob extends SpecJob>(
  job: TJob,
  budget: ThreadBudget,
  signal?: AbortSignal,
): ThreadRun<ReplyTo<TJob["kind"]>> {
  signal?.throwIfAborted();
  const resourceLimits = threadLimits(budget);
  const worker = new Worker(STUDIO_THREAD_SCRIPT, { resourceLimits });
  const exited = new Promise<void>((resolve) => worker.once("exit", () => resolve()));
  const reply = new Promise<ReplyTo<TJob["kind"]>>((resolve, reject) => {
    const fail = watch(worker, job, budget, signal, { resolve, reject });
    try {
      worker.postMessage(job);
    } catch (error) {
      /* A job that cannot be posted ends its thread like any other failure. */
      fail(error);
    }
  });
  return { reply, exited };
}

/* Whichever comes first ends the thread and settles the job; what comes
   after is ignored. Returns how to fail the job from outside. */
function watch<TJob extends SpecJob>(
  worker: Worker,
  job: TJob,
  budget: ThreadBudget,
  signal: AbortSignal | undefined,
  settle: Settle<ReplyTo<TJob["kind"]>>,
): (reason: unknown) => void {
  const timers: NodeJS.Timeout[] = [];
  let ended = false;
  const end = (finish: () => void): void => {
    if (ended) return;
    ended = true;
    for (const timer of timers) clearTimeout(timer);
    signal?.removeEventListener("abort", gone);
    void worker.terminate();
    finish();
  };
  const fail = (reason: unknown): void => end(() => settle.reject(reason));
  const gone = (): void => fail(signal?.reason);
  let greeted = false;
  const silent = (): void =>
    afterWaitingMessages(() => {
      if (!greeted) fail(StudioThreadError.silent(THREAD_READY_MS));
    });
  const greeting = setTimeout(silent, THREAD_READY_MS);
  const budgetSpent = (): void =>
    afterWaitingMessages(() => fail(SpecWorkLimitError.time(job.kind, budget.ms)));
  timers.push(greeting, setTimeout(budgetSpent, budget.ms));
  signal?.addEventListener("abort", gone, { once: true });
  const done = (reply: ReplyTo<TJob["kind"]>): void => end(() => settle.resolve(reply));
  const hello = (): void => {
    greeted = true;
    clearTimeout(greeting);
  };
  listenToThread(worker, job, budget, { greeted: hello, done, fail });
  return fail;
}

/* A timer fires late once Studio's own thread was busy, ahead of the thread's
   messages that came meanwhile; two turns of the loop read those first. */
function afterWaitingMessages(run: () => void): void {
  setImmediate(() => setImmediate(run));
}
