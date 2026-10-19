/**
 * JSONC (JSON with comments) helpers for the playground: pure functions the
 * editor, the request panel and the WS compose panel use without the editor
 * component.
 */

/** Strip `//` line comments and trailing commas so the result parses as JSON. */
export function stripComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
}

/** What JSONC text holds, or `{ ok: false }` when it does not parse. */
export type JsoncResult = { ok: true; value: unknown } | { ok: false };

/**
 * Read JSONC text: comments and trailing commas stripped, then parsed.
 *
 * @param text - The editor's text
 * @returns The value it holds, or `{ ok: false }` when it is not JSON
 * @example
 * ```ts
 * parseJsonc('{ "a": 1, } // note'); // → { ok: true, value: { a: 1 } }
 * ```
 */
export function parseJsonc(text: string): JsoncResult {
  try {
    return { ok: true, value: JSON.parse(stripComments(text)) };
  } catch {
    /* The parse error is the answer: the caller treats the text as invalid. */
    return { ok: false };
  }
}

/** Validate JSONC by stripping comments first then attempting `JSON.parse`. */
export function isValidJsonc(str: string): boolean {
  return parseJsonc(str).ok;
}

interface ToggleCommentResult {
  text: string;
  start: number;
  end: number;
}

/* One line's `// ` going in or coming out: where, in the text as it was,
   and how many characters it adds — or takes away, when negative. */
interface MarkEdit {
  at: number;
  length: number;
}

/* Where a place in the text lands once the marks are in or out: past a mark
   added before it, or right at it when `withText`, and where a mark taken
   away around it stood. */
function moved(place: number, edits: readonly MarkEdit[], withText: boolean): number {
  let shift = 0;
  for (const { at, length } of edits) {
    if (length > 0 && (place > at || (withText && place === at))) shift += length;
    else if (length < 0 && place > at) shift -= Math.min(-length, place - at);
  }
  return place + shift;
}

/* The first and last line a selection holds: a caret holds its own line,
   and a selection that ends where a line starts holds none of that line. */
function heldLines(text: string, start: number, end: number): { first: number; last: number } {
  const first = text.slice(0, start).split("\n").length - 1;
  const last = text.slice(0, end).split("\n").length - 1;
  return { first, last: end > start && text[end - 1] === "\n" ? last - 1 : last };
}

const isBlank = (line: string): boolean => line.trim() === "";

interface ToggledLine {
  line: string;
  edit: MarkEdit;
}

/* A line with its mark put in, or taken out, and that edit; `lineAt` is where the line starts. */
function toggled(line: string, lineAt: number, uncomment: boolean): ToggledLine {
  const indent = line.length - line.trimStart().length;
  const [lead, body] = [line.slice(0, indent), line.slice(indent)];
  const at = lineAt + indent;
  if (!uncomment) return { line: `${lead}// ${body}`, edit: { at, length: 3 } };
  const removed = body[2] === " " ? 3 : 2;
  return { line: lead + body.slice(removed), edit: { at, length: -removed } };
}

/**
 * Toggle `// ` line comments across the lines the selection holds. If every
 * line is already commented, uncomment them; otherwise prefix each line with
 * `// `. Blank lines stay as they are, unless the selection holds nothing
 * else: a caret on an empty line gets a mark to type a comment after.
 * The selection keeps the text it held: it grows over a mark added at its
 * edge, a caret stays before the text it stood before, and one inside a
 * mark taken away lands where the mark stood.
 *
 * @param text - The full editor contents
 * @param selStart - Selection start offset (0-indexed)
 * @param selEnd - Selection end offset (0-indexed)
 * @returns The updated text and where the selection now is
 * @example
 * ```ts
 * toggleComment('{\n  "a": 1\n}', 2, 10); // → { text: '{\n  // "a": 1\n}', start: 2, end: 13 }
 * ```
 */
export function toggleComment(text: string, selStart: number, selEnd: number): ToggleCommentResult {
  const lines = text.split("\n");
  const { first, last } = heldLines(text, selStart, selEnd);
  const held = lines.slice(first, last + 1);
  const skipBlank = !held.every(isBlank);
  const uncomment = held.every((l) => (skipBlank && isBlank(l)) || l.trimStart().startsWith("//"));

  const edits: MarkEdit[] = [];
  let lineAt = lines.slice(0, first).reduce((at, line) => at + line.length + 1, 0);
  for (let i = first; i <= last; i++) {
    const line = lines[i] ?? "";
    if (!(skipBlank && isBlank(line))) {
      const next = toggled(line, lineAt, uncomment);
      lines[i] = next.line;
      edits.push(next.edit);
    }
    lineAt += line.length + 1;
  }

  return {
    text: lines.join("\n"),
    start: moved(selStart, edits, selStart === selEnd),
    end: moved(selEnd, edits, true),
  };
}
