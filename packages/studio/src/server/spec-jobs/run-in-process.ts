import { existsSync } from "node:fs";

import {
  JOB_MEMORY_WATCH_SCRIPT,
  startWorkerProcess,
  stopWorkerProcess,
  type WorkerProcess,
} from "@noverax/courier-cli/devkit";
import { SPEC_WORKER_SCRIPT } from "../worker-scripts";
import { type JobBudget, jobFlags, jobMemoryMb } from "./job-budgets";
import { listenToProcess } from "./listen-to-process";
import type { ReplyTo, SpecJob } from "./spec-job-protocol";
import { SpecWorkLimitError } from "./spec-work-limit-error";
import { StudioWorkerError } from "./studio-worker-error";

/** How long a job's process has to greet Studio once started: it starts in tens of milliseconds. */
export const WORKER_READY_MS = 10_000;

/** A job running in a process of its own. */
export interface JobRun<TReply> {
  /** The process's reply: settles as soon as the job is done, has failed, or was stopped. */
  readonly reply: Promise<TReply>;
  /**
   * Settles once the process has ended and its memory is freed — after
   * `reply`, by as long as that takes. Never rejects.
   */
  readonly exited: Promise<void>;
}

interface Settle<TValue> {
  resolve(value: TValue): void;
  reject(reason: unknown): void;
}

/**
 * Run one job in a process of its own, started for it and stopped once it
 * is done — whichever comes first of its reply, its budget of time or
 * memory, its failure, or its caller's going — so that no specification,
 * however large and however its YAML is shaped, holds up Studio's server,
 * a job stopped leaves nothing running, and a process that fails, however
 * it fails, leaves Studio running. Its reply comes as soon as the job is
 * over; the process's end, which frees its memory, is told apart, so that
 * whoever counts the jobs running counts this one until it is gone.
 *
 * The process greets Studio before it is given its job, with the version
 * of what its script understands. One that names another version, or says
 * nothing within {@link WORKER_READY_MS}, runs a script from another build of
 * Studio: the job fails at once, saying so, rather than wait out its budget
 * for an answer that will not come. The job's time is counted from when it
 * is given.
 *
 * @param job - What to do, and what with
 * @param budget - The time and memory the job may take
 * @param signal - Aborted once its caller goes away: the process is stopped
 * @returns The process's end, and its reply — the job's result, or why its
 *   input has none — which rejects with {@link SpecWorkLimitError} when the
 *   job takes longer or more memory than its budget, with
 *   {@link StudioWorkerError} when the worker script is from another build of
 *   Studio or missing or the process fails, and with the signal's reason
 *   once it is aborted
 * @throws {RangeError} For a budget no process can run within, before any process starts
 * @throws The signal's reason, when it was aborted before any process started
 * @example
 * ```ts
 * const { reply, exited } = runInProcess({ kind: "spec:diff", oldJson, newJson }, VISITOR_DIFF, signal);
 * ```
 */
export function runInProcess<TJob extends SpecJob>(
  job: TJob,
  budget: JobBudget,
  signal?: AbortSignal,
): JobRun<ReplyTo<TJob["kind"]>> {
  signal?.throwIfAborted();
  const flags = jobFlags(budget);
  const missing = [SPEC_WORKER_SCRIPT, JOB_MEMORY_WATCH_SCRIPT].find(
    (script) => !existsSync(script),
  );
  if (missing !== undefined) {
    return { reply: Promise.reject(StudioWorkerError.missing(missing)), exited: Promise.resolve() };
  }
  const worker = startWorkerProcess(SPEC_WORKER_SCRIPT, flags, { memoryMb: jobMemoryMb(budget) });
  const exited = new Promise<void>((resolve) => worker.child.once("close", () => resolve()));
  const reply = new Promise<ReplyTo<TJob["kind"]>>((resolve, reject) => {
    watch(worker, job, budget, signal, { resolve, reject });
  });
  return { reply, exited };
}

/* Whichever comes first stops the process and settles the job; what comes after is ignored. */
function watch<TJob extends SpecJob>(
  worker: WorkerProcess,
  job: TJob,
  budget: JobBudget,
  signal: AbortSignal | undefined,
  settle: Settle<ReplyTo<TJob["kind"]>>,
): void {
  const timers: NodeJS.Timeout[] = [];
  let ended = false;
  const end = (finish: () => void): void => {
    if (ended) return;
    ended = true;
    for (const timer of timers) clearTimeout(timer);
    signal?.removeEventListener("abort", gone);
    stopWorkerProcess(worker.child);
    finish();
  };
  const fail = (reason: unknown): void => end(() => settle.reject(reason));
  const gone = (): void => fail(signal?.reason);
  let greeted = false;
  const silent = (): void =>
    afterWaitingMessages(() => {
      if (!greeted) fail(StudioWorkerError.silent(WORKER_READY_MS));
    });
  const budgetSpent = (): void =>
    afterWaitingMessages(() => fail(SpecWorkLimitError.time(job.kind, budget.ms)));
  timers.push(setTimeout(silent, WORKER_READY_MS));
  signal?.addEventListener("abort", gone, { once: true });
  const give = (): void => {
    if (greeted) return;
    greeted = true;
    for (const timer of timers.splice(0)) clearTimeout(timer);
    timers.push(setTimeout(budgetSpent, budget.ms));
    sendJob(worker, job, fail);
  };
  const done = (reply: ReplyTo<TJob["kind"]>): void => end(() => settle.resolve(reply));
  listenToProcess(worker, job, budget, { greeted: give, done, fail });
}

/* Give the process its job, which Node copies to it at once — or cannot:
   a value Node fails to copy throws here, in the process's message handler,
   and would end Studio. A job's specifications go as JSON text, which no
   depth stops. A job that is copied but cannot reach the process fails as
   the process's own. */
function sendJob(worker: WorkerProcess, job: SpecJob, fail: (reason: unknown) => void): void {
  try {
    worker.child.send(job, (error) => {
      if (error) fail(StudioWorkerError.failed(error));
    });
  } catch (error) {
    fail(SpecWorkLimitError.unsendable(job.kind, error));
  }
}

/* A timer fires late once Studio's own thread was busy, ahead of the
   process's messages that came meanwhile; two turns of the loop read those first. */
function afterWaitingMessages(run: () => void): void {
  setImmediate(() => setImmediate(run));
}
