/** Opening line of the generated source, whichever shape it takes. */
const DECLARATION_RE = /^export\s+const\s+\w+\s*=\s*define(?:Group|Api)\(\{/;
const OPENS_ENDPOINTS = /^\s*endpoints:\s*\{\s*$/;

/** Where a group's or a flat API's declaration and its endpoints are, by line index. */
export interface EndpointsBlock {
  /** The line opening the declaration. */
  declaration: number;
  /** The line `endpoints: {`. */
  open: number;
  /** The line closing the endpoints, found by balancing brackets from `open`. */
  close: number;
  /** The line closing the declaration. */
  end: number;
}

function closingLine(lines: string[], from: number): number {
  let depth = 0;
  for (let i = from; i < lines.length; i++) {
    for (const ch of lines[i] ?? "") {
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
    }
    if (depth <= 0) return i;
  }
  return -1;
}

/**
 * Find a declaration's endpoints in a file: the line opening them and the
 * one closing them, matched by bracket depth, so an endpoint wrapped across
 * lines with objects of its own never ends the block early.
 *
 * @param lines - The file's lines
 * @returns The block, or `null` when the file shows no declaration holding endpoints
 * @example
 * ```ts
 * const block = findEndpointsBlock(content.split("\n"));
 * lines.splice(block.close, 0, ...newEndpoints);
 * ```
 */
export function findEndpointsBlock(lines: string[]): EndpointsBlock | null {
  const declaration = lines.findIndex((l) => DECLARATION_RE.test(l));
  if (declaration === -1) return null;
  const open = lines.findIndex((l, i) => i > declaration && OPENS_ENDPOINTS.test(l));
  if (open === -1) return null;
  const close = closingLine(lines, open);
  const end = closingLine(lines, declaration);
  if (close === -1 || end === -1 || close > end) return null;
  return { declaration, open, close, end };
}
