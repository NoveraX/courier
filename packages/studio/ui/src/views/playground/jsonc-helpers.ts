/**
 * JSONC (JSON with comments) helpers shared by the playground editor.
 *
 * Extracted from `json-editor.tsx` so the React component file only deals
 * with rendering. The helpers here are pure functions and can be used by
 * other playground modules (request panel, ws compose panel) without
 * pulling the editor component into their bundles.
 */

/** Strip `//` line comments and trailing commas so the result parses as JSON. */
export function stripComments(text: string): string {
  return text.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1");
}

/** Validate JSONC by stripping comments first then attempting `JSON.parse`. */
export function isValidJsonc(str: string): boolean {
  try {
    JSON.parse(stripComments(str));
    return true;
  } catch {
    return false;
  }
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
export function toggleComment(
  text: string,
  selStart: number,
  selEnd: number,
): ToggleCommentResult {
  const lines = text.split("\n");
  const startLine = text.slice(0, selStart).split("\n").length - 1;
  const endLine = text.slice(0, selEnd).split("\n").length - 1;

  const allCommented = lines
    .slice(startLine, endLine + 1)
    .every((l) => l.trimStart().startsWith("//"));

  let offset = 0;
  for (let i = startLine; i <= endLine; i++) {
    if (allCommented) {
      // Uncomment: remove `// ` or `//`
      const idx = lines[i].indexOf("//");
      if (idx === -1) continue;
      const hasSpace = lines[i][idx + 2] === " ";
      const removed = hasSpace ? 3 : 2;
      lines[i] = lines[i].slice(0, idx) + lines[i].slice(idx + removed);
      if (i === startLine) offset -= removed;
    } else {
      const indent = lines[i].match(/^(\s*)/)?.[1] ?? "";
      lines[i] = `${indent}// ${lines[i].slice(indent.length)}`;
      if (i === startLine) offset += 3;
    }
  }

  return { text: lines.join("\n"), start: selStart + offset, end: selEnd + offset };
}
