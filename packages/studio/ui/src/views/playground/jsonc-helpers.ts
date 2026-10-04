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

/**
 * Toggle `// ` line comments across the selection range. If every line is
 * already commented, uncomment them; otherwise prefix each line with `// `.
 *
 * @param text - The full editor contents
 * @param selStart - Selection start offset (0-indexed)
 * @param selEnd - Selection end offset (0-indexed)
 * @returns The updated text plus a new selection range that compensates for
 *   inserted/removed comment markers.
 */
export function toggleComment(text: string, selStart: number, selEnd: number): ToggleCommentResult {
  const lines = text.split("\n");
  const startLine = text.slice(0, selStart).split("\n").length - 1;
  const endLine = text.slice(0, selEnd).split("\n").length - 1;

  const allCommented = lines
    .slice(startLine, endLine + 1)
    .every((l) => l.trimStart().startsWith("//"));

  let offset = 0;
  for (let i = startLine; i <= endLine; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (allCommented) {
      // Uncomment: remove `// ` or `//`
      const idx = line.indexOf("//");
      if (idx === -1) continue;
      const removed = line[idx + 2] === " " ? 3 : 2;
      lines[i] = line.slice(0, idx) + line.slice(idx + removed);
      if (i === startLine) offset -= removed;
    } else {
      const indent = line.match(/^(\s*)/)?.[1] ?? "";
      lines[i] = `${indent}// ${line.slice(indent.length)}`;
      if (i === startLine) offset += 3;
    }
  }

  return { text: lines.join("\n"), start: selStart + offset, end: selEnd + offset };
}
