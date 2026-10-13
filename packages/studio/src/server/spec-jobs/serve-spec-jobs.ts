import { runSpecJob } from "./run-spec-job";
import { isSpecJob, SPEC_JOB_PROTOCOL, type WorkerReady } from "./spec-job-protocol";

/**
 * Greet Studio with the version of what this worker script understands,
 * then answer the job Studio gives it with {@link runSpecJob}. Studio gives
 * each job a process of its own and stops the process after, so a job that
 * takes too long or too much memory is stopped by stopping its process, and
 * leaves nothing behind. A process whose Studio has gone ends too.
 *
 * @example
 * ```ts
 * serveSpecJobs();
 * ```
 */
export function serveSpecJobs(): void {
  if (process.send === undefined) return;
  send({ kind: "worker:ready", protocol: SPEC_JOB_PROTOCOL } satisfies WorkerReady);
  process.on("message", (message: unknown) => {
    if (isSpecJob(message)) send(runSpecJob(message));
  });
  process.on("disconnect", () => process.exit(0));
}

/* A message Studio is gone before it takes: this process has nothing left to do. */
function send(message: unknown): void {
  process.send?.(message, (error: Error | null) => {
    if (error) process.exit(0);
  });
}
