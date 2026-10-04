import type { SchemaConstraints } from "../parser/types";
import { patternLiteral } from "./pattern-literal";

/**
 * Chain the checks a request makes of a value onto its zod schema.
 *
 * zod's `min` and `max` read a string's or a list's length and a number's
 * value alike, so each constraint maps to one method whatever the type.
 *
 * @param base - The zod schema of the value's type
 * @param constraints - What the value may hold beyond its type
 * @returns The schema with its checks, or `base` when there are none
 * @example
 * ```ts
 * withZodChecks("z.string()", { maxLength: 5000 }); // → "z.string().max(5000)"
 * ```
 */
export function withZodChecks(base: string, constraints: SchemaConstraints | undefined): string {
  if (!constraints) return base;
  const { pattern } = constraints;
  const checks = [
    constraints.integer && ".int()",
    bound("min", constraints.minLength ?? constraints.minItems ?? constraints.minimum),
    bound("max", constraints.maxLength ?? constraints.maxItems ?? constraints.maximum),
    bound("gt", constraints.exclusiveMinimum),
    bound("lt", constraints.exclusiveMaximum),
    bound("multipleOf", constraints.multipleOf),
    pattern && `.regex(${patternLiteral(pattern)})`,
  ];
  return base + checks.filter((check) => typeof check === "string").join("");
}

function bound(method: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `.${method}(${value})`;
}
