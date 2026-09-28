import type { ValueConstraints } from "./schema-introspect";

/**
 * Move a generated number inside the bounds its schema declares, then onto
 * the grid its integer or `multipleOf` check requires. A value that already
 * passes is returned unchanged, so field-name heuristics survive whenever
 * the schema allows them.
 *
 * @param value       The number a heuristic produced
 * @param constraints Bounds, integer and step read from the schema
 * @returns A number the schema accepts, or the closest one when the checks contradict each other
 * @example
 * ```ts
 * fitNumber(19, { min: 21, max: 99, integer: true }); // 21
 * fitNumber(37.14, { integer: true, min: 0, exclusiveMin: true }); // 37
 * ```
 */
export function fitNumber(value: number, constraints: ValueConstraints): number {
  const bounded = withinBounds(value, constraints) ? value : moveInside(value, constraints);
  const step = constraints.multipleOf ?? (constraints.integer ? 1 : undefined);
  if (step === undefined || step <= 0) return bounded;

  const k = bounded / step;
  const snapped = [Math.round(k), Math.ceil(k), Math.floor(k)].map((n) => onGrid(n, step));
  return snapped.find((candidate) => withinBounds(candidate, constraints)) ?? snapped[0] ?? bounded;
}

function withinBounds(value: number, c: ValueConstraints): boolean {
  const aboveMin = c.min === undefined || (c.exclusiveMin ? value > c.min : value >= c.min);
  const belowMax = c.max === undefined || (c.exclusiveMax ? value < c.max : value <= c.max);
  return aboveMin && belowMax;
}

function moveInside(value: number, c: ValueConstraints): number {
  if (c.min !== undefined && c.max !== undefined) {
    const clamped = Math.min(Math.max(value, c.min), c.max);
    return withinBounds(clamped, c) ? clamped : (c.min + c.max) / 2;
  }
  if (c.min !== undefined) return c.exclusiveMin ? c.min + 1 : c.min;
  if (c.max !== undefined) return c.exclusiveMax ? c.max - 1 : c.max;
  return value;
}

/* A fractional step such as 0.01 leaves floating-point noise
   (0.30000000000000004); rounding to the step's own precision removes it. */
function onGrid(multiple: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number((multiple * step).toFixed(decimals));
}
