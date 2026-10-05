/** A key is written unquoted, as a property name, into `courier.mocks.ts`. */
const KEY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;

/**
 * What is wrong with a mock key on its own, by the rules Studio applies: an
 * ASCII identifier of at most 64 characters, and no name every object
 * inherits (`toString`, `constructor`, `__proto__`), which a lookup by key
 * would find where nothing was declared.
 *
 * @param key - The key as typed
 * @returns Why it cannot be a key, or `null` when it can
 *
 * @example
 * ```ts
 * keyRuleProblem("apiMock"); // → null
 * keyRuleProblem("my-api"); // → "a key must be an identifier of …"
 * keyRuleProblem("toString"); // → "\"toString\" is a name every object inherits, so it cannot be a key"
 * ```
 */
export function keyRuleProblem(key: string): string | null {
  if (!KEY_PATTERN.test(key)) {
    return "a key must be an identifier of 1 to 64 letters, digits, _ or $ that does not start with a digit";
  }
  if (key in Object.prototype) {
    return `"${key}" is a name every object inherits, so it cannot be a key`;
  }
  return null;
}
