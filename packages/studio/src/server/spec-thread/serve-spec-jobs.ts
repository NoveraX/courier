import type { MessagePort } from "node:worker_threads";

import { runSpecJob } from "./run-spec-job";
import { isSpecJob, SPEC_THREAD_PROTOCOL, type ThreadReady } from "./spec-thread-protocol";

/**
 * Greet Studio with the version of what this thread script understands,
 * then answer each job it is posted with {@link runSpecJob}. Studio gives
 * each job a thread of its own and ends the thread after, so a job that
 * takes too long or too much memory is stopped by ending its thread, and
 * leaves nothing behind.
 *
 * @param port - The thread's port to Studio; none outside a thread
 * @example
 * ```ts
 * serveSpecJobs(parentPort);
 * ```
 */
export function serveSpecJobs(port: MessagePort | null): void {
  if (port === null) return;
  port.postMessage({ kind: "thread:ready", protocol: SPEC_THREAD_PROTOCOL } satisfies ThreadReady);
  port.on("message", (message: unknown) => {
    if (isSpecJob(message)) port.postMessage(runSpecJob(message));
  });
}
