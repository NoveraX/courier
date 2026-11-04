import type { PubSubAdapter } from "./adapters";
import { createMemoryBus } from "./memory-bus";

/**
 * The pub/sub adapter of a server that runs alone: a replica on a bus of
 * its own, which has no other replica to reach, so what it publishes goes
 * nowhere and it hears nothing. It keeps the whole contract — ready from the
 * start, stopped by `disconnect()` — for a handler written for replicas and
 * run as one. Handlers that share one process share a bus instead:
 * {@link createMemoryBus}.
 *
 * @param origin - The replica's name; one is made up when left out
 * @returns The adapter
 * @example
 * ```ts
 * const pubsub = createMemoryPubSub();
 * createWSHandler({ pubsub });
 * ```
 */
export function createMemoryPubSub(origin?: string): PubSubAdapter {
  return createMemoryBus().replica(origin);
}
