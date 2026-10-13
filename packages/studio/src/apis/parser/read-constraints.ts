import { leaveOutPattern } from "./left-out-patterns";
import { MAX_PATTERN_LENGTH } from "./max-pattern-length";
import { fieldOf, type SpecNode } from "./spec-node";
import type { SchemaConstraints } from "./types";

/**
 * Read what a schema allows beyond its type: the JSON Schema validation
 * keywords that apply to it.
 *
 * Only the keywords of the schema's own type are read — lengths and a
 * pattern for a string, bounds for a number, item counts for a list — and
 * only values that mean something: a length or a count is a whole number of
 * zero or more, a bound a finite number. OpenAPI 3.0 and Swagger 2.0 write
 * an exclusive bound as `exclusiveMinimum: true` beside `minimum`; OpenAPI
 * 3.1 writes the bound itself; both read the same. A `multipleOf` is kept
 * only when it is a whole number: a fraction cannot be checked exactly in
 * floating point, so `0.3` would be refused as a multiple of `0.1`. A
 * pattern is kept as JavaScript compiles it — with the `u` flag when it
 * compiles so, else without — and left out when it does not compile at all,
 * so the value is then not checked against it. One longer than
 * {@link MAX_PATTERN_LENGTH} is left out without being compiled, and noted
 * for the parse under way to say where (see `withLeftOutPatterns`).
 *
 * @param node - The schema as written in the specification
 * @param type - The type the schema declares
 * @returns The constraints, or `undefined` when the schema has none
 * @example
 * ```ts
 * readConstraints({ type: "string", maxLength: 5000, pattern: "^cus_" }, "string");
 * // → { maxLength: 5000, pattern: { source: "^cus_", unicode: true } }
 * ```
 */
export function readConstraints(
  node: SpecNode,
  type: string | undefined,
): SchemaConstraints | undefined {
  const read = constraintsOfType(node, type);
  return Object.keys(read).length === 0 ? undefined : read;
}

function constraintsOfType(node: SpecNode, type: string | undefined): SchemaConstraints {
  if (type === "string") {
    const minLength = count(fieldOf(node, "minLength"));
    const maxLength = count(fieldOf(node, "maxLength"));
    const pattern = compiledPattern(fieldOf(node, "pattern"));
    return {
      ...(minLength !== undefined && { minLength }),
      ...(maxLength !== undefined && { maxLength }),
      ...(pattern !== undefined && { pattern }),
    };
  }
  if (type === "number" || type === "integer") return numberConstraints(node, type);
  if (type === "array") {
    const minItems = count(fieldOf(node, "minItems"));
    const maxItems = count(fieldOf(node, "maxItems"));
    return {
      ...(minItems !== undefined && { minItems }),
      ...(maxItems !== undefined && { maxItems }),
    };
  }
  return {};
}

function numberConstraints(node: SpecNode, type: "number" | "integer"): SchemaConstraints {
  const minimum = finite(fieldOf(node, "minimum"));
  const maximum = finite(fieldOf(node, "maximum"));
  const lower = exclusiveBound(fieldOf(node, "exclusiveMinimum"), minimum);
  const upper = exclusiveBound(fieldOf(node, "exclusiveMaximum"), maximum);
  const divisor = finite(fieldOf(node, "multipleOf"));
  const multipleOf =
    divisor !== undefined && Number.isInteger(divisor) && divisor > 0 ? divisor : undefined;
  return {
    ...(type === "integer" && { integer: true }),
    ...(minimum !== undefined && !lower.replaces && { minimum }),
    ...(maximum !== undefined && !upper.replaces && { maximum }),
    ...(lower.bound !== undefined && { exclusiveMinimum: lower.bound }),
    ...(upper.bound !== undefined && { exclusiveMaximum: upper.bound }),
    ...(multipleOf !== undefined && { multipleOf }),
  };
}

/* An exclusive bound: the 3.1 number itself, or the inclusive one a 3.0 `true` turns exclusive. */
function exclusiveBound(
  declared: unknown,
  inclusive: number | undefined,
): { bound: number | undefined; replaces: boolean } {
  if (declared === true && inclusive !== undefined) return { bound: inclusive, replaces: true };
  return { bound: finite(declared), replaces: false };
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function compiledPattern(source: unknown): SchemaConstraints["pattern"] {
  if (typeof source !== "string" || source === "") return undefined;
  if (source.length > MAX_PATTERN_LENGTH) {
    leaveOutPattern(source);
    return undefined;
  }
  if (compiles(source, "u")) return { source, unicode: true };
  if (compiles(source, "")) return { source, unicode: false };
  return undefined;
}

function compiles(source: string, flags: string): boolean {
  try {
    new RegExp(source, flags);
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}
