/**
 * In-process async mutex for `.nexus/imports-state.json` read-modify-write
 * operations. Serializes every mutation through a single queue so concurrent
 * HTTP requests cannot corrupt the state file.
 *
 * Reentrant via `AsyncLocalStorage`: a task that already holds the lock can
 * call `withImportsLock` again from its own async context and the inner call
 * executes inline instead of queuing behind its own outer task (which would
 * deadlock, because the outer task's completion depends on the inner call
 * returning). This lets the persistence helpers in `imports-bridge.ts` own
 * their concurrency contract while still allowing routes to compose
 * multi-step transactions around them.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { logger } from "@noverax/nexus";

type Task<T> = () => Promise<T> | T;

const insideLock = new AsyncLocalStorage<true>();
let pending: Promise<unknown> = Promise.resolve();

/**
 * Executes `fn` after all previously queued imports-state operations
 * complete. Guarantees serial execution — no two top-level `fn` callbacks
 * run concurrently. Nested calls from within an already-held lock run
 * inline to prevent self-deadlock.
 */
export function withImportsLock<T>(fn: Task<T>): Promise<T> {
  if (insideLock.getStore()) {
    return Promise.resolve().then(fn);
  }
  const run = (): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      insideLock.run(true, () => {
        try {
          Promise.resolve(fn()).then(resolve, reject);
        } catch (err) {
          reject(err);
        }
      });
    });
  const next = pending.then(run, run);
  pending = next.catch((err: unknown) => {
    logger.debug(
      "ImportsLock",
      `Background task failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  return next;
}
