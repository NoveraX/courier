/**
 * In-process async mutex for registry read-modify-write operations.
 *
 * Prevents concurrent requests from corrupting the registry file
 * by serializing all mutations through a single queue.
 */

type Task<T> = () => Promise<T> | T;

let pending: Promise<unknown> = Promise.resolve();

/**
 * Executes `fn` after all previously queued registry operations complete.
 * Guarantees serial execution — no two `fn` callbacks run concurrently.
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
  pending = next.catch(() => {});
  return next;
}
