import type { SchemaConstraints } from "../parser/types";
import { jsLiteral } from "./literals";

/**
 * Write a constraint's pattern as JavaScript that builds it.
 *
 * Built from a string rather than written as a `/…/` literal, so no
 * character of the pattern needs escaping to fit the literal's syntax.
 *
 * @param pattern - The pattern, as the parser compiled it
 * @returns Source text for the `RegExp`
 * @example
 * ```ts
 * patternLiteral({ source: "^cus_", unicode: true }); // → 'new RegExp("^cus_", "u")'
 * ```
 */
export function patternLiteral(pattern: NonNullable<SchemaConstraints["pattern"]>): string {
  return `new RegExp(${jsLiteral(pattern.source)}${pattern.unicode ? ', "u"' : ""})`;
}
