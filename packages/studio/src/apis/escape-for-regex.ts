/**
 * A value as a regular expression matches it literally: every character a
 * pattern reads as syntax is escaped.
 *
 * @param value - Text to find, such as a name
 * @returns The pattern source that matches exactly it
 * @example
 * ```ts
 * new RegExp(`^${escapeForRegex("$.ref")}$`).test("$.ref"); // true
 * ```
 */
export function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
