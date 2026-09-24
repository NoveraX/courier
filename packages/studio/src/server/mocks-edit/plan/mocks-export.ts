import { blockLines } from "./block-lines";
import type { FileStyle } from "./types";

/**
 * Write the `export default defineMocks({ ... })` statement a mocks file
 * without a default export gains: the entries one per line at one unit of
 * indentation, in the file's line endings, commas and semicolons.
 *
 * @param mocksCallee - `defineMocks` as the file calls it
 * @param entries - The entries, rendered at one unit of indentation
 * @param style - The file's style
 * @returns The statement, without line breaks around it
 *
 * @example
 * ```ts
 * mocksExport("defineMocks", ["x: 1"], DEFAULT_STYLE); // → "export default defineMocks({\n  x: 1,\n});"
 * ```
 */
export function mocksExport(
  mocksCallee: string,
  entries: readonly string[],
  style: FileStyle,
): string {
  const body = blockLines(entries, style.indent, style.eol, style.trailingCommas);
  const statement = `export default ${mocksCallee}({${style.eol}${body}})`;
  return style.semicolons ? `${statement};` : statement;
}
