const BOM = String.fromCharCode(0xfeff);

/**
 * A text's BOM, kept apart from the rest so that a change leaves it where
 * it is.
 *
 * @param text - A file's text
 * @returns The BOM, `""` where it has none, and the rest
 * @example
 * ```ts
 * withoutBom("# Rules\n"); // { bom: "", body: "# Rules\n" }
 * ```
 */
export function withoutBom(text: string): { bom: string; body: string } {
  return text.startsWith(BOM) ? { bom: BOM, body: text.slice(1) } : { bom: "", body: text };
}

/**
 * The line end a text's lines take: CRLF where its first line ends with
 * one, LF otherwise.
 *
 * @param text - A file's text
 * @returns `"\r\n"` or `"\n"`
 * @example
 * ```ts
 * lineEndOf("# Rules\r\n"); // "\r\n"
 * ```
 */
export function lineEndOf(text: string): string {
  const at = text.indexOf("\n");
  return at > 0 && text[at - 1] === "\r" ? "\r\n" : "\n";
}

/**
 * Lines added at the end of a text, after an empty line: the text itself
 * as it was, and the lines ended as its own are. An empty text is the
 * lines alone.
 *
 * @param body - The text, its BOM left out
 * @param addition - The lines to add, joined by LF
 * @returns The text with the lines at its end
 * @example
 * ```ts
 * appendedText("# Rules\n", "@AGENTS.md"); // "# Rules\n\n@AGENTS.md\n"
 * ```
 */
export function appendedText(body: string, addition: string): string {
  const eol = lineEndOf(body);
  const lines = eol === "\n" ? addition : addition.split("\n").join(eol);
  if (body === "") return `${lines}${eol}`;
  let breaks = 0;
  for (let end = body.length - 1; end >= 0 && (body[end] === "\n" || body[end] === "\r"); end--)
    if (body[end] === "\n") breaks++;
  const gap = breaks >= 2 ? "" : breaks === 1 ? eol : `${eol}${eol}`;
  return `${body}${gap}${lines}${eol}`;
}
