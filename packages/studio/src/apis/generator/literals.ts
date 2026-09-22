/**
 * Write values taken from a specification into generated source.
 *
 * Every one of these is free text chosen by whoever wrote the specification —
 * a property may be named `a"b`, a base URL may contain a backslash, an enum
 * member may hold a quote. Wrapping such a value in quote characters produced
 * a literal that ended early and a file that did not parse, so all of them go
 * through the encoder that has to read them back.
 */

/** A value a specification may list in an `enum`. */
export type SpecValue = string | number | boolean;

/**
 * Write a value as a JavaScript literal.
 *
 * @param value - Text or number taken from the specification
 * @returns Source text that evaluates back to exactly this value
 *
 * @example
 * ```ts
 * jsLiteral('a"b') // → '"a\\"b"'
 * ```
 */
export function jsLiteral(value: SpecValue): string {
  return JSON.stringify(value);
}

/**
 * Write a name as an object key, quoting it only when it has to be.
 *
 * @param name - Property name taken from the specification
 * @returns The bare name when it is a valid identifier, otherwise a quoted key
 *
 * @example
 * ```ts
 * objectKey("id")      // → "id"
 * objectKey("user-id") // → '"user-id"'
 * ```
 */
export function objectKey(name: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}
