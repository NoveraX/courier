import type { SchemaConstraints } from "../parser/types";

/* What a regular expression literal cannot hold as it is, and how it says each one instead. */
const LITERAL_ESCAPES: Readonly<Record<string, string>> = {
  "/": "\\/",
  "\n": "\\n",
  "\r": "\\r",
  " ": "\\u2028",
  " ": "\\u2029",
};

/**
 * Write a constraint's pattern as a regular expression literal.
 *
 * A literal rather than `new RegExp("…")`, which linters reject wherever a
 * literal can say the same. The pattern keeps its meaning: only a `/` and a
 * line terminator, which would end the literal or break it, are escaped,
 * and an escape the pattern already has is left as it is — so the literal's
 * `source` is the one the pattern compiled from its string has.
 *
 * @param pattern - The pattern, as the parser compiled it
 * @returns Source text for the `RegExp`
 * @example
 * ```ts
 * patternLiteral({ source: "^cus_", unicode: true }); // → "/^cus_/u"
 * patternLiteral({ source: "^a/b$", unicode: false }); // → "/^a\\/b$/"
 * ```
 */
export function patternLiteral(pattern: NonNullable<SchemaConstraints["pattern"]>): string {
  return `/${literalBody(pattern.source)}/${pattern.unicode ? "u" : ""}`;
}

/* An empty pattern matches everywhere; `//` would open a comment instead. A
   `/` inside a character class is left as it is, as the pattern's own
   `source` writes it, since a class does not end the literal. */
function literalBody(source: string): string {
  if (source === "") return "(?:)";
  let body = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === "\\" && i + 1 < source.length) {
      const next = source.charAt(i + 1);
      /* An escaped line terminator matches it either way, and only its escape fits a literal. */
      body += `\\${LITERAL_ESCAPES[next]?.slice(1) ?? next}`;
      i++;
      continue;
    }
    if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    body += char === "/" && inClass ? char : (LITERAL_ESCAPES[char] ?? char);
  }
  return body;
}
