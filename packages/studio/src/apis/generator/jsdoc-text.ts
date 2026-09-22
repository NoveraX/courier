/**
 * Render spec-authored prose so it survives being placed inside a JSDoc block.
 *
 * A description is free text written by whoever wrote the API specification,
 * and a comment-closing delimiter anywhere inside it ends the block early —
 * everything after it on that line is then read as code. GitHub's own
 * specification documents a branch glob containing one, which is enough to
 * stop the generated module from parsing.
 *
 * The escaped form still reads as intended in rendered documentation.
 *
 * @param text - Description, summary or title taken from the specification
 * @returns The same text, safe to place between comment delimiters
 */
export function jsdocText(text: string): string {
  return text.replace(/\*\//g, "*\\/");
}
