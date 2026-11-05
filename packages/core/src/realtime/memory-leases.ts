import type { ConnectionLeaseStore } from "./adapters";

/**
 * Connection leases in this process's memory: the default store of a limit
 * on one key's connections, which then counts the connections of the
 * handlers sharing it — one replica's, unless a store every replica shares
 * is given instead. A scope's leases
 * are kept in the order they were taken, so the oldest are the first given
 * up. Nothing lapses: a handler releases each lease as its connection
 * closes.
 *
 * @returns The store
 *
 * @example
 * ```ts
 * const leases = createMemoryConnectionLeases();
 * await leases.acquire("key:user-1", connectionId, { max: 3, onExceed: "evict-oldest" });
 * ```
 */
export function createMemoryConnectionLeases(): ConnectionLeaseStore {
  /* Each scope's leases, oldest first: a Map keeps the order they were set in. */
  const scopes = new Map<string, Set<string>>();

  return {
    async acquire(scope, lease, rule) {
      const held = scopes.get(scope) ?? new Set<string>();
      scopes.set(scope, held);
      if (held.has(lease)) return { admitted: true, evict: [] };
      if (held.size < rule.max) {
        held.add(lease);
        return { admitted: true, evict: [] };
      }
      if (rule.onExceed === "reject") return { admitted: false };
      const evict = [...held].slice(0, held.size - rule.max + 1);
      for (const given of evict) held.delete(given);
      held.add(lease);
      return { admitted: true, evict };
    },
    async renew() {
      /* Nothing lapses here: what is held stays until it is released. */
    },
    async release(scope, lease) {
      const held = scopes.get(scope);
      held?.delete(lease);
      if (held?.size === 0) scopes.delete(scope);
    },
  };
}
