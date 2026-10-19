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

/* What would end a `<script>` the code is shown in, or a line where an older parser reads one. */
const UNSAFE_IN_CODE = /[<>\u2028\u2029]/g;

/**
 * Write a value, or a list of values, as a JavaScript literal: `<`, `>`
 * and the two line separators as `\u` escapes, so the code stays whole
 * wherever it is put, a page's `<script>` among them. Each of them can only
 * stand inside a string of the JSON text, so escaping it there is exact for
 * a list too.
 *
 * @param value - Text or number taken from the specification, or a list of them
 * @returns Source text that evaluates back to exactly this value
 *
 * @example
 * ```ts
 * jsLiteral('a"b') // → '"a\\"b"'
 * jsLiteral("</script>") // → '"\\u003c/script\\u003e"'
 * jsLiteral(["id", "<b>"]) // → '["id","\\u003cb\\u003e"]'
 * ```
 */
export function jsLiteral(value: SpecValue | readonly SpecValue[]): string {
  return JSON.stringify(value).replace(UNSAFE_IN_CODE, unicodeEscape);
}

function unicodeEscape(char: string): string {
  return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
}

const IDENTIFIER = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

/**
 * Write a name as a key of an object literal, quoting it only when it has
 * to be. `__proto__` is written as a computed key: bare or quoted, an object
 * literal takes it for the object's prototype, and the field is lost.
 *
 * @param name - Property name taken from the specification
 * @returns The bare name when it is a valid identifier, otherwise a quoted key
 *
 * @example
 * ```ts
 * objectKey("id")        // → "id"
 * objectKey("user-id")   // → '"user-id"'
 * objectKey("__proto__") // → '["__proto__"]'
 * ```
 */
export function objectKey(name: string): string {
  if (name === "__proto__") return `[${jsLiteral(name)}]`;
  return typeKey(name);
}

/**
 * Write a name as a property of an object type, quoting it only when it has
 * to be: `__proto__` too, which in a type names a field and sets nothing.
 *
 * @param name - Property name taken from the specification
 * @returns The bare name when it is a valid identifier, otherwise a quoted key
 *
 * @example
 * ```ts
 * typeKey("__proto__") // → "__proto__"
 * typeKey("user-id")   // → '"user-id"'
 * ```
 */
export function typeKey(name: string): string {
  return IDENTIFIER.test(name) ? name : jsLiteral(name);
}
