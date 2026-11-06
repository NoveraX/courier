/*
 * The adapters of a bus inside one process, marked as the bus makes them:
 * nothing outside the process can publish on their channels, so a cluster
 * with no secret takes no stranger's command over them. Nothing public
 * names the mark; a copy of an adapter, or one of the application's own,
 * is not marked.
 */
const inProcess = new WeakSet<object>();

/**
 * Mark an adapter only its own process can publish on.
 *
 * @param adapter - The adapter a bus in the process made
 * @returns The adapter
 * @example
 * ```ts
 * return markInProcess(memoryReplica(channels, origin, log));
 * ```
 */
export function markInProcess<T extends object>(adapter: T): T {
  inProcess.add(adapter);
  return adapter;
}

/**
 * Whether only its own process can publish on an adapter's channels.
 *
 * @param adapter - The adapter
 * @returns Whether a bus in the process made it
 * @example
 * ```ts
 * if (!isInProcess(pubsub)) log.warn("Commands between replicas are taken unsigned");
 * ```
 */
export function isInProcess(adapter: object): boolean {
  return inProcess.has(adapter);
}
