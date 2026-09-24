import type { ParsedSource } from "./parse-source";

/**
 * The source text a node spans.
 *
 * @param parsed - The file the node is in
 * @param node - Any node, or anything with a span
 * @returns The text from its start to its end, as written
 *
 * @example
 * ```ts
 * textOf(parseSource("x.ts", "a = { b: 1 };"), { start: 4, end: 12 }); // → "{ b: 1 }"
 * ```
 */
export function textOf(parsed: ParsedSource, node: { start: number; end: number }): string {
  return parsed.text.slice(node.start, node.end);
}
