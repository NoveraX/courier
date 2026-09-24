import type { FileStyle } from "./types";

const NAMED: ReadonlyMap<string, string> = new Map([
  ["\\", "\\\\"],
  ["\r", "\\r"],
  ["\n", "\\n"],
]);

/**
 * Write a string literal in the file's quote.
 *
 * @param value - The string's value
 * @param quote - The quote the file uses
 * @returns The literal, escaped so it reads back as `value` once written to disk as UTF-8
 *
 * @example
 * ```ts
 * quoteString("it's", "'"); // → 'it\'s'
 * ```
 */
export function quoteString(value: string, quote: FileStyle["quote"]): string {
  let escaped = "";
  for (const char of value) escaped += char === quote ? `\\${quote}` : escapeChar(char);
  return `${quote}${escaped}${quote}`;
}

/* Line terminators and control characters cannot stand in a literal as
   written, or would read as something else inside one. A surrogate with no
   partner has no UTF-8 encoding: written raw it reaches the disk as U+FFFD,
   a different string, so it is escaped too. Iterating by code point yields
   such a surrogate alone, and a pair as one two-unit string. */
function escapeChar(char: string): string {
  const named = NAMED.get(char);
  if (named !== undefined) return named;
  const code = char.charCodeAt(0);
  return char.length === 1 && mustEscape(code) ? `\\u${code.toString(16).padStart(4, "0")}` : char;
}

function mustEscape(code: number): boolean {
  const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
  const separator = code === 0x2028 || code === 0x2029;
  return control || separator || (code >= 0xd800 && code <= 0xdfff);
}
