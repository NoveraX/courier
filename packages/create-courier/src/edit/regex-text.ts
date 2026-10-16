/**
 * Text as a regular expression that matches it alone: every character a
 * pattern gives a meaning written as itself.
 *
 * @param text - The text
 * @returns The pattern's source
 * @example
 * ```ts
 * new RegExp(regexText("./courier.config")).test("./courier.config"); // true, and false for "a/courierXconfig"
 * ```
 */
export function regexText(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/**
 * A name as a pattern: a dotted one as the member it reaches, written with
 * any spaces around its dots.
 *
 * @param name - A name, such as `courier` or `app.use`
 * @returns The pattern's source
 * @example
 * ```ts
 * new RegExp(namePattern("app.use")).test("app . use"); // true
 * ```
 */
export function namePattern(name: string): string {
  return name.split(".").map(regexText).join("\\s*\\.\\s*");
}
