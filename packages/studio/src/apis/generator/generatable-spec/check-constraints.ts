import { isNode, type SpecNode } from "../../parser/spec-node";
import type { SchemaConstraints } from "../../parser/types";
import { patternCloses } from "../pattern-closes";
import type { SpecPath } from "./spec-path";

/* Every constraint the generator writes as a number, as it stands. */
const NUMBERS = [
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
] as const satisfies readonly (keyof SchemaConstraints)[];

/**
 * Check what a value may hold beyond its type: each count and bound a
 * finite number, which the generator writes as it stands — `NaN` would
 * refuse every value, as the parser never lets it; a pattern one whose
 * literal ends where it does. Whether the value is a whole number is only
 * ever tested, and the pattern's `u` flag only decides whether one is
 * written, so neither is held to anything.
 *
 * @param constraints - The constraints, as the specification gives them
 * @param at - Where they are
 * @throws {InvalidSpecError} For a constraint refused
 * @example
 * ```ts
 * checkConstraints({ maxLength: 20 }, at); // passes
 * checkConstraints({ maxLength: "1).refine(run)" }, at); // throws
 * ```
 */
export function checkConstraints(constraints: SpecNode, at: SpecPath): void {
  for (const key of NUMBERS) {
    const value = constraints[key];
    if (value !== undefined && !Number.isFinite(value)) {
      at.field(key).refuse(value, "a count or a bound is a finite number");
    }
  }
  const { pattern } = constraints;
  if (pattern === undefined || pattern === null) return;
  const written: SpecPath = at.field("pattern");
  if (!isNode(pattern)) written.refuse(pattern, "it is not an object");
  const { source } = pattern;
  const sourceAt: SpecPath = written.field("source");
  if (typeof source !== "string") sourceAt.refuse(source, "a pattern's source is a string");
  if (!patternCloses(source)) {
    sourceAt.refuse(source, "its literal would not end where the pattern does");
  }
}
