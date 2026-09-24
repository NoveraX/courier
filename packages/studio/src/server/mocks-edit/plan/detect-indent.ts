import { LINE_TERMINATOR } from "./line-terminator";

const LEADING = /^[ \t]*/;
const SPACES = /^ {2,8}$/;

/** The indentation Biome writes, used when a file shows none. */
export const DEFAULT_INDENT = "  ";

/**
 * Find a file's unit of indentation: the step most often taken from one
 * non-blank line to a more deeply indented next one, when that step is a
 * tab or two to eight spaces. Steps of one space (JSDoc's ` * `) and
 * irregular ones do not count.
 *
 * @param text - The source text
 * @returns The unit, or two spaces when the file shows none
 *
 * @example
 * ```ts
 * detectIndent("a({\n    b,\n});\n"); // → "    "
 * ```
 */
export function detectIndent(text: string): string {
  const counts = new Map<string, number>();
  let previous: string | null = null;
  for (const line of text.split(LINE_TERMINATOR)) {
    if (line.trim() === "") continue;
    const indent = LEADING.exec(line)?.[0] ?? "";
    const step =
      previous !== null && indent.startsWith(previous) ? indent.slice(previous.length) : "";
    if (step === "\t" || SPACES.test(step)) counts.set(step, (counts.get(step) ?? 0) + 1);
    previous = indent;
  }
  return mostFrequent(counts) ?? DEFAULT_INDENT;
}

/* Ties go to the step seen first. */
function mostFrequent(counts: ReadonlyMap<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [step, count] of counts) {
    if (count > bestCount) {
      best = step;
      bestCount = count;
    }
  }
  return best;
}
