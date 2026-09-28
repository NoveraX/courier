import type { ValueConstraints } from "../types";
import type { ConstraintRule } from "./types";

/**
 * Fold one rule into the constraints read so far. Bounds only ever tighten,
 * so `positive().min(5)` keeps the stricter of the two.
 *
 * @param constraints Constraints collected from earlier checks, updated in place
 * @param rule        The check to add
 * @returns Nothing; `constraints` is updated
 * @example
 * ```ts
 * const c: ValueConstraints = {};
 * applyRule(c, { kind: "min", value: 0, inclusive: false });
 * applyRule(c, { kind: "min", value: 5, inclusive: true });
 * // c.min === 5, c.exclusiveMin === false
 * ```
 */
export function applyRule(constraints: ValueConstraints, rule: ConstraintRule): void {
  switch (rule.kind) {
    case "min":
      raiseMin(constraints, rule.value, !rule.inclusive);
      break;
    case "max":
      lowerMax(constraints, rule.value, !rule.inclusive);
      break;
    case "integer":
      constraints.integer = true;
      break;
    case "multipleOf":
      constraints.multipleOf = rule.value;
      break;
    case "minLength":
      constraints.minLength = Math.max(constraints.minLength ?? 0, rule.value);
      break;
    case "maxLength":
      constraints.maxLength = Math.min(constraints.maxLength ?? rule.value, rule.value);
      break;
    case "length":
      constraints.minLength = rule.value;
      constraints.maxLength = rule.value;
      break;
    default:
      applyStringRule(constraints, rule);
  }
}

function applyStringRule(constraints: ValueConstraints, rule: ConstraintRule): void {
  switch (rule.kind) {
    case "format":
      constraints.format = rule.format;
      break;
    case "pattern":
      constraints.patterns = [...(constraints.patterns ?? []), statelessPattern(rule.pattern)];
      break;
    case "startsWith":
      constraints.startsWith = rule.value;
      break;
    case "endsWith":
      constraints.endsWith = rule.value;
      break;
    case "includes":
      constraints.includes = [...(constraints.includes ?? []), rule.value];
      break;
  }
}

function raiseMin(constraints: ValueConstraints, value: number, exclusive: boolean): void {
  const current = constraints.min;
  if (current !== undefined && (value < current || (value === current && !exclusive))) return;
  constraints.min = value;
  constraints.exclusiveMin = exclusive;
}

function lowerMax(constraints: ValueConstraints, value: number, exclusive: boolean): void {
  const current = constraints.max;
  if (current !== undefined && (value > current || (value === current && !exclusive))) return;
  constraints.max = value;
  constraints.exclusiveMax = exclusive;
}

/* A `g` or `y` flag makes `test()` resume from the previous match, so the
   same value would pass on one call and fail on the next. */
function statelessPattern(pattern: RegExp): RegExp {
  const flags = pattern.flags.replace(/[gy]/g, "");
  return flags === pattern.flags ? pattern : new RegExp(pattern.source, flags);
}
