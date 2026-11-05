import { takeCall } from "./gcra";
import type { RateLimitStore } from "./types";

/** How many callers a store in the process remembers at once. */
export interface MemoryRateLimitOptions {
  /** Callers remembered at once, past which the longest-idle is forgotten — 100,000 by default. */
  maxCallers?: number | undefined;
}

/* Callers whose budget is whole are swept once in this many calls, as well as by the timer. */
const SWEEP_EVERY = 1024;
/* The timer sweeps no more often than this, however short a window. */
const SHORTEST_SWEEP_MS = 1000;
/* The longest delay a timer keeps: past it, Node fires at once. */
const LONGEST_SWEEP_MS = 2 ** 31 - 1;

/**
 * Callers' counts kept in this process — enough for one replica; replicas
 * that share a load balancer share a store instead. A caller whose budget
 * is whole again is forgotten within the shortest window the store counts
 * in, whether calls come or not, so it keeps a caller at most two of its
 * windows after the caller's last call — two seconds where a window is
 * shorter than a second. Past `maxCallers` remembered at once, the
 * longest-idle is forgotten first, so a flood of new addresses costs a
 * bounded amount of memory and never refuses a caller it does not know.
 * Each call costs the same however many callers are remembered: one is
 * forgotten for each one past them, and the rest are swept once in a
 * while — by a timer that runs only while anyone is remembered, and keeps
 * no process running.
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
  /* The timer's period: the shortest window counted in, within what a timer can wait. */
  let period = LONGEST_SWEEP_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;

  /* One timer for every caller, running only while anyone is remembered. */
  function schedule(): void {
    if (timer !== undefined || spent.size === 0) return;
    timer = setTimeout(tick, period);
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  }

  function tick(): void {
    timer = undefined;
    sweep(spent, Date.now());
    schedule();
  }

  return {
    take(key, limit) {
      const now = Date.now();
      if (++calls % SWEEP_EVERY === 0) sweep(spent, now);
      const { decision, spentUntil } = takeCall(spent.get(key), limit, now);
      spent.delete(key);
      spent.set(key, spentUntil);
      if (spent.size > maxCallers) forgetLongestIdle(spent);
      const window = Math.min(Math.max(limit.window, SHORTEST_SWEEP_MS), LONGEST_SWEEP_MS);
      if (window < period) {
        /* A shorter window than the timer waits for: it waits for this one from now on. */
        period = window;
        clearTimeout(timer);
        timer = undefined;
      }
      schedule();
      return decision;
    },
  };
}

/* Forget whom a whole budget is waiting for. */
function sweep(spent: Map<string, number>, now: number): void {
  for (const [key, until] of spent) if (until <= now) spent.delete(key);
}

/* Each call moves its caller last, so the first is the one idle the longest. */
function forgetLongestIdle(spent: Map<string, number>): void {
  const longestIdle = spent.keys().next();
  if (!longestIdle.done) spent.delete(longestIdle.value);
}
