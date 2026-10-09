import type { AgentLimit } from "@noverax/courier";

const UNITS: ReadonlyArray<readonly [number, string]> = [
  [86_400_000, "day"],
  [3_600_000, "hour"],
  [60_000, "minute"],
  [1000, "second"],
];

/**
 * A limit as a sentence says it: `3 calls a minute`, `1 call every 30 seconds`.
 *
 * @param limit - The limit
 * @returns The words
 * @example
 * ```ts
 * limitText({ maxCalls: 5, window: 3_600_000 }); // "5 calls an hour"
 * ```
 */
export function limitText({ maxCalls, window }: AgentLimit): string {
  const calls = `${maxCalls} call${maxCalls === 1 ? "" : "s"}`;
  for (const [ms, unit] of UNITS) {
    if (window % ms !== 0) continue;
    const count = window / ms;
    if (count === 1) return `${calls} ${unit === "hour" ? "an" : "a"} ${unit}`;
    return `${calls} every ${count} ${unit}s`;
  }
  return `${calls} every ${window / 1000} seconds`;
}

/**
 * How long a wait is, rounded up as a person reads it: `38 s`, `4 min`, `2 h`.
 *
 * @param ms - The wait, in milliseconds
 * @returns The words
 * @example
 * ```ts
 * waitText(37_200); // "38 s"
 * ```
 */
export function waitText(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 120) return `${seconds} s`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${Math.ceil(minutes / 60)} h`;
}
