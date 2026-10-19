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

/**
 * Toggle `// ` line comments across the selection range. If every line is
 * already commented, uncomment them; otherwise prefix each line with `// `.
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
  const startLine = text.slice(0, selStart).split("\n").length - 1;
  const endLine = text.slice(0, selEnd).split("\n").length - 1;

  const allCommented = lines
    .slice(startLine, endLine + 1)
    .every((l) => l.trimStart().startsWith("//"));

  const edits: MarkEdit[] = [];
  let lineAt = lines.slice(0, startLine).reduce((at, line) => at + line.length + 1, 0);
  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i] ?? "";
    const indent = line.length - line.trimStart().length;
    if (allCommented) {
      const removed = line[indent + 2] === " " ? 3 : 2;
      lines[i] = line.slice(0, indent) + line.slice(indent + removed);
      edits.push({ at: lineAt + indent, length: -removed });
    } else {
      lines[i] = `${line.slice(0, indent)}// ${line.slice(indent)}`;
      edits.push({ at: lineAt + indent, length: 3 });
    }
    lineAt += line.length + 1;
  }

  return {
    text: lines.join("\n"),
    start: moved(selStart, edits, selStart === selEnd),
    end: moved(selEnd, edits, true),
  };
}
