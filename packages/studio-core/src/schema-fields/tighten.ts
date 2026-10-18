import type { NodeLimits } from "./schema-node";

/**
 * Narrows a bound to one a schema declares, when it is narrower: the least
 * raised, the most lowered. An open bound — `gt(4)`, `lt(10)` — is taken
 * one step in, as a whole number would be.
 *
 * @param limits - The limits read so far, narrowed in place
 * @param side - Which bound the value sets
 * @param value - The bound, when the schema gave a number
 * @param open - Whether the bound itself is left out
 * @example
 * ```ts
 * tighten(limits, "least", 4, true); // limits.least === 5
 * ```
 */
export function tighten(
  limits: NodeLimits,
  side: "least" | "most",
  value: unknown,
  open = false,
): void {
  if (typeof value !== "number" || Number.isNaN(value)) return;
  const bound = open ? value + (side === "least" ? 1 : -1) : value;
  const now = limits[side];
  if (now === undefined || (side === "least" ? bound > now : bound < now)) limits[side] = bound;
}
