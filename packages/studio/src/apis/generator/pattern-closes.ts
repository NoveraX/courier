/**
 * Tell whether the regular expression literal `patternLiteral` writes for a
 * source ends where the source does. JavaScript reads a literal's body so:
 * a backslash takes the character after it, a `[` opens a class that only
 * `]` closes, and outside a class a `/` ends the literal. A source ending on
 * a lone backslash would escape the literal's closing `/`, a class left
 * open would hold it, and a source starting with `*` would turn the
 * literal's opening `/` into a comment's; each carries the literal on into
 * the code written after it, or that code into a comment. Every pattern
 * that compiles closes; one that does not may close too, and the module it
 * is written into then fails to load.
 *
 * Read in one pass, never compiled: compiling a pattern sent to Studio
 * would cost its main thread what the pattern's author chose.
 *
 * @param source - The pattern's source
 * @returns Whether its literal ends where it does
 * @example
 * ```ts
 * patternCloses("^[a-z/]+$"); // true
 * patternCloses("[/"); // false
 * patternCloses("a\\"); // false
 * patternCloses("*a"); // false
 * ```
 */
export function patternCloses(source: string): boolean {
  if (source.startsWith("*")) return false;
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === "\\") {
      if (i + 1 === source.length) return false;
      i++;
    } else if (char === "[") {
      inClass = true;
    } else if (char === "]") {
      inClass = false;
    }
  }
  return !inClass;
}
