import type { SchemaConstraints } from "../parser/types";
import { patternLiteral } from "./pattern-literal";

/**
 * Pipe a value's valibot schema through the checks a request makes of it.
 *
 * @param base - The valibot schema of the value's type
 * @param constraints - What the value may hold beyond its type
 * @returns The piped schema, or `base` when there is nothing to check
 * @example
 * ```ts
 * withValibotChecks("v.number()", { integer: true, minimum: 1 });
 * // → "v.pipe(v.number(), v.integer(), v.minValue(1))"
 * ```
 */
export function withValibotChecks(
  base: string,
  constraints: SchemaConstraints | undefined,
): string {
  if (!constraints) return base;
  const { pattern } = constraints;
  const actions = [
    constraints.integer && "v.integer()",
    action("minLength", constraints.minLength ?? constraints.minItems),
    action("maxLength", constraints.maxLength ?? constraints.maxItems),
    action("minValue", constraints.minimum),
    action("maxValue", constraints.maximum),
    action("gtValue", constraints.exclusiveMinimum),
    action("ltValue", constraints.exclusiveMaximum),
    action("multipleOf", constraints.multipleOf),
    pattern && `v.regex(${patternLiteral(pattern)})`,
  ].filter((check) => typeof check === "string");
  return actions.length === 0 ? base : `v.pipe(${[base, ...actions].join(", ")})`;
}

function action(name: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `v.${name}(${value})`;
}
