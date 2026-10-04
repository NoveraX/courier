import type { CodeToken } from "./tokenize-line";

const PIECES =
  /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(true|false|null)|(\s+)|([^\s"\d-]+|-)/g;

/**
 * Split a line of pretty-printed JSON into pieces to colour: a key, a
 * string, a number, `true`, `false` or `null`, and the punctuation.
 *
 * @param line - One line of JSON
 * @returns Its pieces, in order
 * @example
 * ```ts
 * tokenizeJsonLine('  "price": 64,').map((t) => t.tone); // ["space", "function", "punctuation", "space", "number", "punctuation"]
 * ```
 */
export function tokenizeJsonLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  for (const match of line.matchAll(PIECES)) {
    const [text, quoted, colon, number, literal, space] = match;
    if (quoted) {
      tokens.push({ text: quoted, tone: colon ? "function" : "string" });
      if (colon) tokens.push({ text: colon, tone: "punctuation" });
    } else if (number) tokens.push({ text, tone: "number" });
    else if (literal) tokens.push({ text, tone: "keyword" });
    else if (space) tokens.push({ text, tone: "space" });
    else tokens.push({ text, tone: "punctuation" });
  }
  return tokens;
}
