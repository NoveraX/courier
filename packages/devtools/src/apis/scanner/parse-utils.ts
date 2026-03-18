/**
 * Generic parsing utilities for TypeScript source scanning.
 */

/**
 * Strip single-line (`//`) and block (`/* ... *​/`) comments from source code.
 *
 * Preserves string literals — does not strip inside `"..."`, `'...'` or `` `...` ``.
 * Replaces comment content with spaces to keep character offsets stable.
 */
export function stripComments(source: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i] ?? "";

    // String literals — skip through
    if (ch === '"' || ch === "'" || ch === "`") {
      const end = skipString(source, i);
      result.push(source.slice(i, end));
      i = end;
      continue;
    }

    // Single-line comment
    if (ch === "/" && source[i + 1] === "/") {
      const end = source.indexOf("\n", i);
      const lineEnd = end === -1 ? source.length : end;
      result.push(" ".repeat(lineEnd - i));
      i = lineEnd;
      continue;
    }

    // Block comment
    if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      const blockEnd = end === -1 ? source.length : end + 2;
      // Preserve newlines for line-based logic
      const block = source.slice(i, blockEnd);
      result.push(block.replace(/[^\n]/g, " "));
      i = blockEnd;
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join("");
}

/** Skip past a string literal (handles escape sequences) */
function skipString(source: string, start: number): number {
  const quote = source[start] ?? "";
  let i = start + 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i++;
  }
  return source.length;
}

/** Extract content between matched delimiters (parens, braces, etc.) */
export function extractBalancedBlock(
  content: string,
  startPos: number,
  openChar: string,
  closeChar: string,
): string | null {
  if (startPos < 0 || content[startPos] !== openChar) return null;

  let depth = 0;
  for (let i = startPos; i < content.length; i++) {
    if (content[i] === openChar) depth++;
    else if (content[i] === closeChar) depth--;
    if (depth === 0) return content.slice(startPos, i + 1);
  }
  return null;
}
