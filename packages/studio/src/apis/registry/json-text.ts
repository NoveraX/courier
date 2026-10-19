import { writeJsonText } from "./write-json-text";

/**
 * The JSON text of a value: `JSON.stringify`'s, or — for a value nested
 * deeper than its recursion goes, which it refuses with a RangeError — the
 * same text written without recursion.
 *
 * @param value - Anything JSON.stringify takes
 * @returns The text, or `undefined` for a value JSON leaves out
 * @throws {TypeError} For an object inside itself, or a BigInt, as JSON.stringify throws
 * @example
 * ```ts
 * jsonText(specNestedTwentyThousandDeep)?.length; // → the text JSON.stringify could not write
 * ```
 */
export function jsonText(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
  }
  const pieces: string[] = [];
  return writeJsonText(value, (piece) => {
    pieces.push(piece);
  })
    ? pieces.join("")
    : undefined;
}
