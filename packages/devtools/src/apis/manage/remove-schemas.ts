/**
 * Removes orphaned schema declarations from a schema file.
 *
 * Returns null if all schemas are removed (file should be deleted).
 */

const DECLARATION_RE = /^export\s+(?:const|type|interface|enum)\s+(\w+)/;

/**
 * Remove specific schema declarations from a file.
 *
 * @returns Updated file content, or null if all schemas removed
 */
export function removeOrphanSchemas(schemaContent: string, orphanNames: string[]): string | null {
  if (orphanNames.length === 0) return schemaContent;

  const removeSet = new Set(orphanNames);
  const lines = schemaContent.split("\n");
  const result: string[] = [];
  let i = 0;
  let totalDeclarations = 0;
  let removedCount = 0;

  while (i < lines.length) {
    const match = lines[i]?.match(DECLARATION_RE);
    if (match?.[1]) {
      totalDeclarations++;
      const endIdx = findBlockEnd(lines, i);

      if (removeSet.has(match[1])) {
        removedCount++;
        // Skip blank line after removed block
        i = endIdx + 1;
        if (lines[i]?.trim() === "") i++;
        continue;
      }

      // Keep the declaration
      for (let j = i; j <= endIdx; j++) {
        result.push(lines[j] ?? "");
      }
      i = endIdx + 1;
      continue;
    }

    result.push(lines[i] ?? "");
    i++;
  }

  if (removedCount >= totalDeclarations) return null;

  return result.join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findBlockEnd(lines: string[], start: number): number {
  let depth = 0;
  let foundOpen = false;

  for (let j = start; j < lines.length; j++) {
    for (const ch of lines[j] ?? "") {
      if (ch === "{" || ch === "(" || ch === "[") {
        depth++;
        foundOpen = true;
      }
      if (ch === "}" || ch === ")" || ch === "]") depth--;
    }
    if (!foundOpen && (lines[j] ?? "").endsWith(";")) return j;
    if (foundOpen && depth <= 0) return j;
  }

  return lines.length - 1;
}
