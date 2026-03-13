/**
 * Generic balanced-block extraction for TypeScript source scanning.
 */

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
