import type { AgentLimit } from "@noverax/courier";

/* The callers counted per server; the least recently seen is forgotten past it, so memory stays bounded. */
const MOST_COUNTS = 10_000;

/** The calls each caller made to each limited tool, within its window. */
export interface CallLimits {
  /**
   * How long a caller waits before the tool takes another of its calls,
   * in milliseconds — `0` when it may call now. Counts nothing.
   */
  waitOf(tool: string, limit: AgentLimit, caller: string): number;
  /**
   * Count a call the tool takes now, and answer `0`; or answer how long the
   * caller waits instead, counting nothing.
   */
  take(tool: string, limit: AgentLimit, caller: string): number;
}

/**
 * The calls a server's limited tools took, each caller's counted apart:
 * when each was made, within the tool's window, measured on a clock that
 * only moves forward. A caller whose window holds `maxCalls` calls waits
 * until the oldest of them leaves it.
 *
 * @param now - The clock, in milliseconds (default: `performance.now`)
 * @returns The counts, empty
 * @example
 * ```ts
 * const limits = callLimits();
 * if (limits.take("orders_refund", { maxCalls: 3, window: 60_000 }, "agent-7") > 0) refuse();
 * ```
 */
export function callLimits(now: () => number = () => performance.now()): CallLimits {
  const counts = new Map<string, number[]>();
  const callsOf = (tool: string, limit: AgentLimit, caller: string): number[] => {
    const key = `${tool}\u0000${caller}`;
    const at = now();
    const calls = (counts.get(key) ?? []).filter((made) => made + limit.window > at);
    counts.delete(key);
    counts.set(key, calls);
    if (counts.size > MOST_COUNTS) counts.delete(counts.keys().next().value ?? key);
    return calls;
  };
  const waitIn = (calls: readonly number[], limit: AgentLimit): number =>
    calls.length < limit.maxCalls
      ? 0
      : Math.max(1, Math.ceil((calls[0] ?? 0) + limit.window - now()));
  return {
    waitOf: (tool, limit, caller) => waitIn(callsOf(tool, limit, caller), limit),
    take: (tool, limit, caller) => {
      const calls = callsOf(tool, limit, caller);
      const wait = waitIn(calls, limit);
      if (wait === 0) calls.push(now());
      return wait;
    },
  };
}
