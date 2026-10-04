/**
 * Render a specification `enum` as a zod schema and as a TypeScript union.
 *
 * `z.enum` accepts string members only, while an OpenAPI enum is not limited
 * to strings — a deletion marker is conventionally
 * `{ "type": "boolean", "enum": [true] }`, which both Stripe and OpenAI ship,
 * and `z.enum([true])` does not type-check.
 *
 * Both forms are written by the JSON encoder, so a member containing a quote
 * or a backslash makes a valid literal.
 */

import { jsLiteral, type SpecValue } from "./literals";

/** Values a specification may list in an `enum`. */
export type EnumValue = SpecValue;

/** Drop the members that describe absence rather than a value. */
function usableValues(values: readonly (EnumValue | null | undefined)[]): EnumValue[] {
  return values.filter((value): value is EnumValue => value !== null && value !== undefined);
}

/**
 * Build the zod schema for an enum.
 *
 * @param values - Members as the specification listed them
 * @returns A zod expression: `z.enum` for strings, literals otherwise
 *
 * @example
 * ```ts
 * zodEnum(["read", "write"]) // → 'z.enum(["read", "write"])'
 * zodEnum([true])            // → 'z.literal(true)'
 * ```
 */
export function zodEnum(values: readonly (EnumValue | null | undefined)[]): string {
  const usable = usableValues(values);
  if (usable.length === 0) return "z.unknown()";

  if (usable.every((value) => typeof value === "string")) {
    return `z.enum([${usable.map((value) => jsLiteral(value)).join(", ")}])`;
  }

  const literals = usable.map((value) => `z.literal(${jsLiteral(value)})`);
  return literals.length === 1 ? (literals[0] as string) : `z.union([${literals.join(", ")}])`;
}

/**
 * Build the TypeScript union for an enum.
 *
 * @param values - Members as the specification listed them
 * @returns A union of literal types, or `never` when nothing is left
 *
 * @example
 * ```ts
 * typeUnion(["read", "write"]) // → '"read" | "write"'
 * ```
 */
export function typeUnion(values: readonly (EnumValue | null | undefined)[]): string {
  const usable = usableValues(values);
  if (usable.length === 0) return "never";
  return usable.map((value) => jsLiteral(value)).join(" | ");
}
