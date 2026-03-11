/**
 * Extracts individual endpoint code blocks from generated group files.
 *
 * Uses regex + bracket-depth tracking to find endpoint boundaries.
 */

/**
 * Extract endpoint code blocks from a group file.
 *
 * Looks for patterns like:
 *   endpointName: endpoint<...>(...)(...)
 *
 * @returns Map of endpointName → full code block (including the name).
 */
export function extractEndpoints(fileContent: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = fileContent.split("\n");
  let i = 0;

  while (i < lines.length) {
    const match = lines[i]?.match(/^\s{4}(\w+):\s*endpoint/);
    if (!match?.[1]) {
      i++;
      continue;
    }

    const name = match[1];
    const endLine = findEndpointEnd(lines, i);
    result[name] = lines.slice(i, endLine + 1).join("\n");
    i = endLine + 1;
  }

  return result;
}

/** Track bracket depth to find the end of an endpoint definition */
function findEndpointEnd(lines: string[], startLine: number): number {
  let depth = 0;
  let foundOpen = false;

  for (let j = startLine; j < lines.length; j++) {
    const line = lines[j] ?? "";
    for (const ch of line) {
      if (ch === "(" || ch === "{" || ch === "[") {
        depth++;
        foundOpen = true;
      }
      if (ch === ")" || ch === "}" || ch === "]") {
        depth--;
      }
    }
    if (foundOpen && depth <= 0) return j;
  }

  return lines.length - 1;
}
