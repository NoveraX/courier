/** The stretch of a text an edit replaced, and what it put there. */
export interface ReplacedRange {
  /** Where the stretch starts. */
  from: number;
  /** Where it ends, in the text before the edit. */
  to: number;
  /** What the edit put in its place; empty when it only removed. */
  insert: string;
}

/**
 * The one stretch an edit changed: what the text before it and the text
 * after it do not share at either end. Typing `insert` over `from`–`to` of
 * the old text gives the new one.
 *
 * @param before - The text before the edit
 * @param after - The text after it
 * @returns The stretch of `before` to replace, and its replacement
 * @example
 * ```ts
 * replacedRange('{\n"a": 1\n}', '{\n  "a": 1\n}'); // { from: 2, to: 2, insert: "  " }
 * replacedRange("// a", "a"); // { from: 0, to: 3, insert: "" }
 * ```
 */
export function replacedRange(before: string, after: string): ReplacedRange {
  const shorter = Math.min(before.length, after.length);
  let from = 0;
  while (from < shorter && before[from] === after[from]) from += 1;
  let tail = 0;
  while (
    tail < shorter - from &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail += 1;
  }
  return { from, to: before.length - tail, insert: after.slice(from, after.length - tail) };
}
