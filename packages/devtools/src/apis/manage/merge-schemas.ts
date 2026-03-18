/**
 * Merges new schema/type declarations into an existing schema file.
 *
 * Only appends schemas not already present in the existing file.
 */

const DECLARATION_RE = /^export\s+(?:const|type|interface|enum)\s+(\w+)/;

/**
 * Append new schema declarations to an existing schema file.
 *
 * @param existingContent - Current schema file on disk
 * @param generatedContent - Freshly generated schema file
 * @param newSchemaNames - Schema names to extract from generated
 * @returns Merged schema file content
 */
export function mergeSchemaFiles(
  existingContent: string,
  generatedContent: string,
  newSchemaNames: string[],
): string {
  if (newSchemaNames.length === 0) return existingContent;

  const existingNames = collectDeclarationNames(existingContent);
  const nameSet = new Set(newSchemaNames);
  const newBlocks = extractDeclarations(generatedContent, nameSet, existingNames);

  if (newBlocks.length === 0) return existingContent;

  // Merge imports from generated into existing
  const mergedImports = mergeSchemaImports(existingContent, generatedContent);
  const bodyWithoutImports = stripImports(existingContent).trimEnd();

  return [mergedImports, "", bodyWithoutImports, "", ...newBlocks, ""].join("\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectDeclarationNames(content: string): Set<string> {
  const names = new Set<string>();
  for (const line of content.split("\n")) {
    const match = line.match(DECLARATION_RE);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

/** Extract full declaration blocks for given names, skipping already-existing */
function extractDeclarations(
  content: string,
  targetNames: Set<string>,
  existingNames: Set<string>,
): string[] {
  const lines = content.split("\n");
  const blocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const match = lines[i]?.match(DECLARATION_RE);
    if (match?.[1] && targetNames.has(match[1]) && !existingNames.has(match[1])) {
      const endIdx = findDeclarationEnd(lines, i);
      blocks.push(lines.slice(i, endIdx + 1).join("\n"));
      i = endIdx + 1;
      continue;
    }
    i++;
  }

  return blocks;
}

function findDeclarationEnd(lines: string[], start: number): number {
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
    // Single-line type alias: `export type X = ...;`
    if (!foundOpen && (lines[j] ?? "").endsWith(";")) return j;
    if (foundOpen && depth <= 0) return j;
  }

  return lines.length - 1;
}

function mergeSchemaImports(existing: string, generated: string): string {
  const existingImports = extractImportLines(existing);
  const generatedImports = extractImportLines(generated);
  const all = new Map<string, string>();

  for (const line of [...existingImports, ...generatedImports]) {
    all.set(line, line);
  }

  return [...all.values()].join("\n");
}

function extractImportLines(content: string): string[] {
  return content.split("\n").filter((l) => l.startsWith("import"));
}

function stripImports(content: string): string {
  const lines = content.split("\n");
  const firstNonImport = lines.findIndex((l) => !l.startsWith("import") && l.trim() !== "");
  return firstNonImport >= 0 ? lines.slice(firstNonImport).join("\n") : "";
}
