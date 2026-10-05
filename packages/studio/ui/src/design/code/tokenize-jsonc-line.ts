import { tokenizeJsonLine } from "./tokenize-json-line";
import type { CodeToken } from "./tokenize-line";

/**
 * A line of JSON with comments split into pieces to colour: a line that is
 * a `//` comment reads as one, any other line as JSON.
 *
 * @param line - The line
 * @returns Its pieces
 * @example
 * ```ts
 * tokenizeJsoncLine('  // "sku": "A"'); // [{ text: "  ", tone: "space" }, { text: '// "sku": "A"', tone: "comment" }]
 * ```
 */
export function tokenizeJsoncLine(line: string): CodeToken[] {
  const comment = /^(\s*)(\/\/.*)$/.exec(line);
  if (!comment) return tokenizeJsonLine(line);
  const [, indent = "", text = ""] = comment;
  const tokens: CodeToken[] = indent ? [{ text: indent, tone: "space" }] : [];
  tokens.push({ text, tone: "comment" });
  return tokens;
}
