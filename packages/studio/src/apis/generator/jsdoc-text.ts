/* What a page's HTML parser reads in a script whatever the code makes of it. */
const SCRIPT_MARKUP = /<(\/script|!--)/gi;

/**
 * Render spec-authored prose so it survives being placed inside a JSDoc block.
 *
 * A description is free text written by whoever wrote the API specification,
 * and a comment-closing delimiter anywhere inside it ends the block early —
 * everything after it on that line is then read as code. GitHub's own
 * specification documents a branch glob containing one, which is enough to
 * stop the generated module from parsing. A `</script` or a `<!--` in it is
 * broken by a backslash too: a page's HTML parser, which knows no comment of
 * the code's, would end or upset a `<script>` the code is put in there.
 *
 * The escaped form still reads as intended in rendered documentation, where
 * the backslash before a punctuation mark shows nothing.
 *
 * @param text - Description, summary or title taken from the specification
 * @returns The same text, safe to place between comment delimiters
 */
export function jsdocText(text: string): string {
  return text.replace(/\*\//g, "*\\/").replace(SCRIPT_MARKUP, "<\\$1");
}
