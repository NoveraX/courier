import { isReadingMethod } from "@noverax/courier/internal";

/** The requests in flight that may write to the store, by request id. */
export interface WritesInFlight {
  /** Note a request as it starts. */
  start(requestId: string, httpMethod: string): void;
  /** Forget a request as it ends, and say whether it may have written. */
  end(requestId: string): boolean;
}

/**
 * Track which requests in flight may write to the store, so the store is
 * sent to Studio again once one of them ends: the Mocks dashboard's counts
 * and the Store view then follow what requests change, not only what
 * Studio's own store commands do. A request whose verb only reads — GET,
 * HEAD, OPTIONS or QUERY — leaves the store as it was.
 *
 * @returns The tracker; a request it was not told of reads as no write
 *
 * @example
 * ```ts
 * const writes = trackWritesInFlight();
 * hooks.onStart = (id, httpMethod) => writes.start(id, httpMethod);
 * hooks.onEnd = (id) => {
 *   if (writes.end(id)) emitter.emitStoreSnapshot();
 * };
 * ```
 */
export function trackWritesInFlight(): WritesInFlight {
  const writes = new Set<string>();
  return {
    start(requestId, httpMethod) {
      if (!isReadingMethod(httpMethod)) writes.add(requestId);
    },
    end(requestId) {
      return writes.delete(requestId);
    },
  };
}
