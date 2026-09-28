/**
 * The ArkType definitions for a primitive and for an enum.
 *
 * ArkType reads its types from STRINGS: `type("string | null")` is a union,
 * while `type("string" | "null")` is a JavaScript bitwise-or of two strings —
 * it evaluates to `0`, and ArkType rejects it at load. `arkExpression` builds
 * only the text; the caller wraps it in a call exactly once.
 */

import { jsLiteral, type SpecValue } from "./literals";

/**
 * The ArkType text for a primitive.
 *
 * @param type - OpenAPI primitive type
 * @param format - OpenAPI format, when it has an ArkType keyword
 * @returns An ArkType expression, `unknown` for anything unrecognised
 *
 * @example
 * ```ts
 * arkExpression("string", "uuid") // → "string.uuid"
 * ```
 */
export function arkExpression(type: string, format?: string): string {
  /* ArkType's ISO date form rejects a zone offset, which most real examples
     carry, its url form rejects the loose values `format: uri` holds, and an
     API hides an address as an empty string, which its email form rejects. */
  if (type === "string" && format === "email") return "string";
  if (type === "string" && format === "date-time") return "string";
  if (type === "string" && format === "uri") return "string";
  if (type === "string" && format === "uuid") return "string.uuid";
  if (type === "string") return "string";
  if (type === "number" || type === "integer") return "number";
  if (type === "boolean") return "boolean";
  if (type === "null") return "null";
  return "unknown";
}

/**
 * The members of an enum, given to ArkType as values.
 *
 * Written as one string instead, a large enum — Stripe lists over a hundred
 * tax id kinds — is parsed by ArkType's types character by character and
 * exceeds TypeScript's instantiation depth; and a member holding both quote
 * kinds cannot be written in that string at all.
 *
 * @param values - Enum members; `undefined` is skipped
 * @param nullable - Whether `null` is accepted even when not listed
 * @returns A `type.enumerated(...)` call, usable in and outside a module
 *
 * @example
 * ```ts
 * enumerated(["on", "off"], true) // → 'type.enumerated("on", "off", null)'
 * ```
 */
export function enumerated(
  values: readonly (SpecValue | null | undefined)[],
  nullable: boolean,
): string {
  const members: string[] = [];
  for (const value of values) {
    if (value === undefined) continue;
    members.push(value === null ? "null" : jsLiteral(value));
  }
  if (nullable && !values.includes(null)) members.push("null");
  return `type.enumerated(${members.join(", ")})`;
}
