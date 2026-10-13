import { takeCall } from "./gcra";
import type { RateLimitStore } from "./types";

/** How many callers a store in the process remembers at once. */
export interface MemoryRateLimitOptions {
  /** Callers remembered at once, past which the longest-idle is forgotten — 100,000 by default. */
  maxCallers?: number | undefined;
}

/* Expired callers are swept once in this many calls. */
const SWEEP_EVERY = 1024;

/**
 * Callers' counts kept in this process — enough for one replica; replicas
 * that share a load balancer share a store instead. A caller whose budget
 * is whole again is forgotten. Past `maxCallers` remembered at once, the
 * longest-idle is forgotten first, so a flood of new addresses costs a
 * bounded amount of memory and never refuses a caller it does not know.
 *
 * @param options - How many callers to remember at once; 100,000 by default
 * @returns The store
 * @example
 * ```ts
 * createHandler({ rateLimit: { requests: 300, window: 60_000, store: memoryRateLimitStore() } });
 * ```
 */
export function memoryRateLimitStore({
  maxCallers = 100_000,
}: MemoryRateLimitOptions = {}): RateLimitStore {
  const spent = new Map<string, number>();
  let calls = 0;
  return {
    take(key, limit) {
      const now = Date.now();
      if (++calls % SWEEP_EVERY === 0) sweep(spent, now);
      const { decision, spentUntil } = takeCall(spent.get(key), limit, now);
      spent.delete(key);
      spent.set(key, spentUntil);
      if (spent.size > maxCallers) sweep(spent, now, maxCallers);
      return decision;
    },
  };
}

/* Forget whom a whole budget is waiting for, then, past `keep`, the longest idle. */
function sweep(spent: Map<string, number>, now: number, keep = Number.POSITIVE_INFINITY): void {
  for (const [key, until] of spent) if (until <= now) spent.delete(key);
  for (const key of spent.keys()) {
    if (spent.size <= keep) return;
    spent.delete(key);
  }
}
