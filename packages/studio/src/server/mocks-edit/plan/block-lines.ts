/**
 * Write entries one per line, as a multi-line list holds them: each at
 * `indent`, followed by a comma and a line break. The last one's comma is
 * left out when `lastComma` is false.
 *
 * @param entries - The entries, without indentation or commas
 * @param indent - The indentation each entry's first line starts at
 * @param eol - The file's line ending
 * @param lastComma - Whether the last entry is followed by a comma
 * @returns The lines, each ending with `eol`
 *
 * @example
 * ```ts
 * blockLines(["a: 1", "b: 2"], "  ", "\n", false); // → "  a: 1,\n  b: 2\n"
 * ```
 */
export function blockLines(
  entries: readonly string[],
  indent: string,
  eol: string,
  lastComma: boolean,
): string {
  const last = entries.length - 1;
  return entries
    .map((entry, i) => `${indent}${entry}${i < last || lastComma ? "," : ""}${eol}`)
    .join("");
}
