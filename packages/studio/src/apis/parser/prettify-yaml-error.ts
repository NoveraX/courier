import type { LineCounter, YAMLParseError } from "yaml";

/* The widest line of text an error quotes, as `yaml` cuts it. */
const WIDTH = 80;

/**
 * Add to an error the position and the line of text `yaml` adds to every
 * error it reports itself — `yaml` does it for each error of a document,
 * and does not export how. Read with `prettyErrors: false`, a document's
 * errors lack both, and only the one thrown needs them.
 *
 * @param error - An error of a document read with `prettyErrors: false`
 * @param text - The document's text
 * @param lines - The line counter the document was read with
 * @returns The same error, its `linePos` set and its message extended
 * @example
 * ```ts
 * const lineCounter = new LineCounter();
 * const doc = parseDocument(text, { prettyErrors: false, lineCounter });
 * throw prettifyYamlError(doc.errors[0], text, lineCounter); // "… at line 2, column 1:\n\na: 2\n^\n"
 * ```
 */
export function prettifyYamlError(
  error: YAMLParseError,
  text: string,
  lines: LineCounter,
): YAMLParseError {
  if (error.pos[0] === -1) return error;
  const [from, to] = error.pos.map((pos) => lines.linePos(pos));
  if (from === undefined) return error;
  error.linePos = to === undefined ? [from] : [from, to];
  error.message += ` at line ${from.line}, column ${from.col}`;
  const quoted = quotedLine(text, lines, from);
  if (/[^ ]/.test(quoted.text)) {
    const count = to?.line === from.line && to.col > from.col ? to.col - from.col : 1;
    const carets = Math.max(1, Math.min(count, WIDTH - quoted.column));
    error.message += `:\n\n${quoted.text}\n${" ".repeat(quoted.column)}${"^".repeat(carets)}\n`;
  }
  return error;
}

interface Position {
  line: number;
  col: number;
}

/* The line the error is on, cut to the width about its column, with the
   line before when the error points at the start of its own. */
function quotedLine(
  text: string,
  lines: LineCounter,
  { line, col }: Position,
): { text: string; column: number } {
  let column = col - 1;
  let quoted = text
    .substring(lines.lineStarts[line - 1] ?? 0, lines.lineStarts[line] ?? text.length)
    .replace(/[\n\r]+$/, "");
  if (column >= 60 && quoted.length > WIDTH) {
    const trimStart = Math.min(column - 39, quoted.length - (WIDTH - 1));
    quoted = `…${quoted.substring(trimStart)}`;
    column -= trimStart - 1;
  }
  if (quoted.length > WIDTH) quoted = `${quoted.substring(0, WIDTH - 1)}…`;
  if (line > 1 && /^ *$/.test(quoted.substring(0, column))) {
    let previous = text.substring(lines.lineStarts[line - 2] ?? 0, lines.lineStarts[line - 1] ?? 0);
    if (previous.length > WIDTH) previous = `${previous.substring(0, WIDTH - 1)}…\n`;
    quoted = previous + quoted;
  }
  return { text: quoted, column };
}
