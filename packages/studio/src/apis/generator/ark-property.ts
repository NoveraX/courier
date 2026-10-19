import { jsLiteral } from "./literals";

const BACKSLASH = "\\";

/** Keys ArkType reads as instructions: spread another object in, say what undeclared keys do. */
const META_KEYS: ReadonlySet<string> = new Set(["...", "+"]);

/**
 * An object property as ArkType's object syntax writes it, under the key
 * that means exactly the property's name.
 *
 * ArkType reads meaning into keys: a trailing `?` makes a property optional,
 * `...` spreads another object in, `+` says what becomes of undeclared keys,
 * and `[…]` declares an index signature. A property the specification named
 * like one of those was read as that syntax: a required `foo?` became an
 * optional `foo`, and `+` or `[string]` did not compile. Such a key is
 * escaped as ArkType documents, with a backslash. A name no escape can say —
 * `\...`, `\+`, `\[…]`, which ArkType reads as those escapes — is written as
 * an index signature over that one literal key, which ArkType makes a
 * required property; an optional name ending in a backslash, which would
 * escape its own `?`, is made optional through its value instead.
 *
 * @param name - The property's name, as the specification writes it
 * @param optional - Whether the property may be left out
 * @param value - The ArkType definition of its value
 * @returns The property, `key: value`
 * @example
 * ```ts
 * arkProperty("foo?", false, 'type("string")'); // the source text "foo\\?": type("string")
 * arkProperty("id", true, 'type("string")'); // the source text "id?": type("string")
 * ```
 */
export function arkProperty(name: string, optional: boolean, value: string): string {
  if (optional && !name.endsWith(BACKSLASH)) return `${jsLiteral(`${name}?`)}: ${value}`;
  const key = literalKey(requiredKey(name));
  return optional ? `${key}: ${value}.optional()` : `${key}: ${value}`;
}

/* `__proto__` computed: written as a string, an object literal takes it for the object's prototype. */
function literalKey(key: string): string {
  return key === "__proto__" ? `[${jsLiteral(key)}]` : jsLiteral(key);
}

/* The key ArkType reads as a required property of exactly this name. */
function requiredKey(name: string): string {
  if (name.endsWith("?")) return `${name.slice(0, -1)}${BACKSLASH}?`;
  if (META_KEYS.has(name) || (name.startsWith("[") && name.endsWith("]"))) {
    return `${BACKSLASH}${name}`;
  }
  const escapesItself =
    (name.startsWith(BACKSLASH) && META_KEYS.has(name.slice(1))) ||
    (name.startsWith(`${BACKSLASH}[`) && name.endsWith("]"));
  return escapesItself ? `[${arkString(name)}]` : name;
}

/* A string literal in ArkType's own syntax: single-quoted, its quotes and backslashes escaped. */
function arkString(value: string): string {
  return `'${value.replace(/[\\']/g, (char) => `${BACKSLASH}${char}`)}'`;
}
