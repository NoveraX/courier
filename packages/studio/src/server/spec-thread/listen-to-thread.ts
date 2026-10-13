import type { Worker } from "node:worker_threads";

import { errnoCode } from "../errno-code";
import {
  isReplyTo,
  isThreadReady,
  type ReplyTo,
  SPEC_THREAD_PROTOCOL,
  type SpecJob,
} from "./spec-thread-protocol";
import { SpecWorkLimitError } from "./spec-work-limit-error";
import { StudioThreadError } from "./studio-thread-error";
import type { ThreadBudget } from "./thread-budgets";

/** What a thread's events lead to. */
export interface ThreadOutcomes<TReply> {
  /** The thread greeted Studio. */
  greeted(): void;
  /** The job is done. */
  done(reply: TReply): void;
  /** The job failed. */
  fail(reason: unknown): void;
}

/* Node names a missing thread script as CommonJS does, and a missing
   module the script imports as an ES module does. */
const MISSING: ReadonlySet<string | undefined> = new Set([
  "MODULE_NOT_FOUND",
  "ERR_MODULE_NOT_FOUND",
]);

/**
 * Turn what a thread running a job says and does into its outcomes. A
 * reply counts once the thread has greeted Studio with the version it
 * speaks; a greeting that names another version fails the job. A reply
 * Studio cannot read, an error and an exit before the reply fail it at
 * once, as the thread's own failure — not as a job over its budget, which
 * is what waiting for a reply that cannot come would make of it.
 *
 * @param worker - The thread
 * @param job - The job it was posted
 * @param budget - The job's time and memory, which an error for memory names
 * @param outcomes - What each event leads to
 * @example
 * ```ts
 * listenToThread(worker, job, budget, { greeted, done: resolve, fail: reject });
 * ```
 */
export function listenToThread<TJob extends SpecJob>(
  worker: Worker,
  job: TJob,
  budget: ThreadBudget,
  outcomes: ThreadOutcomes<ReplyTo<TJob["kind"]>>,
): void {
  let greeted = false;
  worker.on("message", (message: unknown) => {
    if (isThreadReady(message)) {
      greeted = true;
      outcomes.greeted();
      if (message.protocol !== SPEC_THREAD_PROTOCOL) {
        outcomes.fail(StudioThreadError.outdated(message.protocol));
      }
    } else if (greeted && isReplyTo<TJob["kind"]>(message, job.kind)) outcomes.done(message);
  });
  worker.on("messageerror", (error: Error) => outcomes.fail(StudioThreadError.failed(error)));
  worker.on("error", (error: Error) => outcomes.fail(threadFailure(error, job.kind, budget)));
  worker.on("exit", (code: number) => outcomes.fail(StudioThreadError.failed(exited(code))));
}

function exited(code: number): Error {
  return new Error(`The thread ended with code ${code} before it answered.`);
}

/* A thread that ran out of its heap was given too much to do; one whose
   script is not there was never started; any other failure is Studio's own. */
function threadFailure(error: Error, kind: SpecJob["kind"], budget: ThreadBudget): Error {
  const code = errnoCode(error);
  if (code === "ERR_WORKER_OUT_OF_MEMORY")
    return SpecWorkLimitError.memory(kind, budget.heapMb, error);
  if (MISSING.has(code)) return StudioThreadError.missing(error);
  return StudioThreadError.failed(error);
}
