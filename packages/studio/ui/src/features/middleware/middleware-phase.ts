import type { MiddlewareEntry } from "@/store/types-events";

/** Where a middleware works: before the fetch, after it, or around it. */
export type MiddlewarePhase = "before" | "after" | "wrap";

/**
 * Where a middleware worked in a call: the phase it declares, else the one
 * its timing shows — all before `next()`, all after it, or both.
 *
 * @param entry - The middleware's run in a call
 * @returns Its phase
 * @example
 * ```ts
 * phaseOf({ beforeDuration: 1.2, afterDuration: 0 }); // "before"
 * ```
 */
export function phaseOf(
  entry: Pick<MiddlewareEntry, "phase" | "beforeDuration" | "afterDuration">,
): MiddlewarePhase {
  if (entry.phase === "before" || entry.phase === "after" || entry.phase === "wrap") {
    return entry.phase;
  }
  const before = entry.beforeDuration ?? 0;
  const after = entry.afterDuration ?? 0;
  if (before > 0 && after <= 0.01) return "before";
  if (after > 0 && before <= 0.01) return "after";
  return "wrap";
}
