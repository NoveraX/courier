import type { TransformCache } from "@noverax/courier-studio-core/config";
import { createTransformCache } from "@noverax/courier-studio-core/config";

/**
 * The transform cache a mock worker loads `courier.mocks.*` through.
 *
 * Studio has loaded the mocks file by the time it starts a worker, so the
 * worker reads the transforms Studio kept in `directory` and transforms only
 * what is not there. It writes nothing into that directory: Studio keeps what
 * its own loads need, and a worker's entries would only duplicate them. It
 * holds nothing in memory either: it loads once, and a worker of a large
 * project would otherwise keep every module's transform for its whole life.
 *
 * @param directory - Where Studio keeps transforms, as its start message
 *   names it, or `null` when Studio keeps none
 * @returns A cache that only reads `directory` and keeps nothing in memory
 * @example
 * ```ts
 * const { mocks } = await loadCourierMocksFile(mocksFile, {
 *   transformCache: workerTransformCache(transformCacheDirectory),
 * });
 * ```
 */
export function workerTransformCache(directory: string | null): TransformCache {
  return createTransformCache({ directory, readOnly: true, maxMemoryChars: 0 });
}
