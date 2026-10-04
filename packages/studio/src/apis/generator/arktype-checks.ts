import type { SchemaConstraints } from "../parser/types";
import { patternLiteral } from "./pattern-literal";

/**
 * Chain the checks a request makes of a value onto its ArkType type.
 *
 * A whole number is ArkType's own `number.integer`, which the base already
 * names; see {@link arkExpressionOf}.
 *
 * @param base - The ArkType type object of the value's type
 * @param constraints - What the value may hold beyond its type
 * @returns The type with its checks, or `base` when there are none
 * @example
 * ```ts
 * withArkChecks('type("string")', { minLength: 1 }); // → 'type("string").atLeastLength(1)'
 * ```
 */
export function withArkChecks(base: string, constraints: SchemaConstraints | undefined): string {
  if (!constraints) return base;
  const { pattern } = constraints;
  const checks = [
    method("atLeastLength", constraints.minLength ?? constraints.minItems),
    method("atMostLength", constraints.maxLength ?? constraints.maxItems),
    method("atLeast", constraints.minimum),
    method("atMost", constraints.maximum),
    method("moreThan", constraints.exclusiveMinimum),
    method("lessThan", constraints.exclusiveMaximum),
    method("divisibleBy", constraints.multipleOf),
    pattern && `.matching(${patternLiteral(pattern)})`,
  ];
  return base + checks.filter((check) => typeof check === "string").join("");
}

/**
 * The ArkType expression of a primitive, a whole number named as one.
 *
 * @param expression - The expression of the value's type, such as `number`
 * @param constraints - What the value may hold beyond its type
 * @returns `number.integer` for a whole number, else the expression as given
 * @example
 * ```ts
 * arkExpressionOf("number", { integer: true }); // → "number.integer"
 * ```
 */
export function arkExpressionOf(
  expression: string,
  constraints: SchemaConstraints | undefined,
): string {
  return constraints?.integer && expression === "number" ? "number.integer" : expression;
}

function method(name: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : `.${name}(${value})`;
}
