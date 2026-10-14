import type { WorkerProcess } from "@noverax/courier-cli/devkit";
import { type JobBudget, jobMemoryMb } from "./job-budgets";
import {
  isReplyTo,
  isWorkerReady,
  type ReplyTo,
  SPEC_JOB_PROTOCOL,
  type SpecJob,
} from "./spec-job-protocol";
import { SpecWorkLimitError } from "./spec-work-limit-error";
import { StudioWorkerError } from "./studio-worker-error";

/** What a worker process's messages and its end come to, for the job it was given. */
export interface ProcessOutcomes<TReply> {
  /** The process greeted Studio with this build's version: it may be given its job. */
  greeted(): void;
  /** The job is done. */
  done(reply: TReply): void;
  /** The job failed. */
  fail(reason: unknown): void;
}

/**
 * Listen to a job's worker process: its greeting — of this build's version,
 * or of another build's, which fails the job at once — its reply to the
 * job, once it has greeted, and its end. A process that ends before it
 * answers ran out of its heap, as V8 reports on its stderr, or took more
 * memory than its whole process may, as its memory watch reports there, or
 * failed; whichever, Studio, in a process of its own, goes on.
 *
 * @param worker - The process, and what its stderr said
 * @param job - The job it is given
 * @param budget - The job's budget, which a process that ran out of memory spent
 * @param outcomes - What its greeting, its reply and its end come to
 * @example
 * ```ts
 * listenToProcess(worker, job, VISITOR_READ, { greeted: send, done, fail });
 * ```
 */
export function listenToProcess<TJob extends SpecJob>(
  worker: WorkerProcess,
  job: TJob,
  budget: JobBudget,
  outcomes: ProcessOutcomes<ReplyTo<TJob["kind"]>>,
): void {
  let greeted = false;
  worker.child.on("message", (message: unknown) => {
    if (isWorkerReady(message)) {
      greeted = true;
      if (message.protocol === SPEC_JOB_PROTOCOL) outcomes.greeted();
      else outcomes.fail(StudioWorkerError.outdated(message.protocol));
    } else if (greeted && isReplyTo<TJob["kind"]>(message, job.kind)) outcomes.done(message);
  });
  worker.child.on("error", (error: Error) => outcomes.fail(StudioWorkerError.failed(error)));
  worker.child.on("close", (code: number | null, signal: NodeJS.Signals | null) =>
    outcomes.fail(endedEarly(worker, code, signal, job.kind, budget)),
  );
}

/* Why a process ended before it answered: out of its heap or of what the
   whole process may take, or another failure — with the error it reported,
   for Studio's log, not its answer. */
function endedEarly(
  worker: WorkerProcess,
  code: number | null,
  signal: NodeJS.Signals | null,
  kind: SpecJob["kind"],
  budget: JobBudget,
): Error {
  const how = signal === null ? `code ${code}` : `signal ${signal}`;
  const message = `The process ended with ${how} before it answered.`;
  const reported = worker.lastError();
  const ended =
    reported === undefined
      ? new Error(message)
      : new Error(message, { cause: new Error(reported) });
  const memory = worker.outOfMemory();
  if (memory === "heap") return SpecWorkLimitError.memory(kind, budget.heapMb, ended);
  if (memory === "process") return SpecWorkLimitError.memory(kind, jobMemoryMb(budget), ended);
  return StudioWorkerError.failed(ended);
}
