import type { ParsedSchema } from "./types";

/* Keyed by every type, so one added to `ParsedSchema` and left out here does not compile. */
const TYPES = {
  object: true,
  array: true,
  string: true,
  number: true,
  integer: true,
  boolean: true,
  null: true,
  enum: true,
  ref: true,
  union: true,
  any: true,
} as const satisfies Record<ParsedSchema["type"], true>;
const SCHEMA_TYPES: ReadonlySet<unknown> = new Set(Object.keys(TYPES));

/**
 * Tell whether a value is one of the types a parsed schema has.
 *
 * @param value - A type a specification declares, or one a parsed schema holds
 * @returns Whether `ParsedSchema` lists it
 * @example
 * ```ts
 * isSchemaType("union"); // true
 * isSchemaType("string; run()"); // false
 * ```
 */
export function isSchemaType(value: unknown): value is ParsedSchema["type"] {
  return SCHEMA_TYPES.has(value);
}
