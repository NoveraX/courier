/**
 * In-process async mutex for registry read-modify-write operations.
 *
 * Prevents concurrent requests from corrupting the registry file
 * by serializing all mutations through a single queue.
 */

import { logger } from "@noverax/nexus";

type Task<T> = () => Promise<T> | T;

let pending: Promise<unknown> = Promise.resolve();

/**
 * Executes `fn` after all previously queued registry operations complete.
 * Guarantees serial execution — no two `fn` callbacks run concurrently.
 *
 * The internal `pending` chain swallows individual task failures so one
 * rejected operation doesn't poison the entire queue. Failures are still
 * propagated to the caller through the returned `next` promise — the
 * `.catch()` here only protects subsequent queue entries from being
 * cancelled. Errors are logged at debug level so background failures
 * remain observable.
 *
 * @example
 * ```ts
 * const result = await withRegistryLock(() => {
 *   const config = loadRegistry();
 *   config = addSource(config, ...);
 *   saveRegistry(config);
 *   return config;
 * });
 * ```
 */
export function withRegistryLock<T>(fn: Task<T>): Promise<T> {
  const next = pending.then(fn, fn);
  pending = next.catch((err: unknown) => {
    logger.debug(
      "RegistryLock",
      `Background task failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
  return next;
}
