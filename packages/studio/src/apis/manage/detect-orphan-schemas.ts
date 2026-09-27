/**
 * Detects orphaned schemas — those no longer referenced by any remaining endpoint.
 *
 * Builds a simple dependency graph to avoid removing schemas
 * that are still depended on by non-orphan schemas.
 */

const DECLARATION_RE = /^export\s+(?:const|type|interface|enum)\s+(\w+)/;

/**
 * Find the schemas that removed endpoints used, directly or through other
 * schemas, and that nothing left uses: the remaining endpoints, or a
 * schema that stays. A schema the removed endpoints did not use is never
 * one, and neither is anything a schema that stays depends on.
 *
 * @param schemaFileContent - Full content of the schema file
 * @param remainingGroupContents - Combined content of all remaining group files
 * @param removedCode - The code of the endpoints removed
 * @returns Array of schema names safe to remove
 */
export function detectOrphanSchemas(
  schemaFileContent: string,
  remainingGroupContents: string,
  removedCode: string,
): string[] {
  const allSchemas = collectSchemaNames(schemaFileContent);
  if (allSchemas.length === 0) return [];
  const schemaDeps = buildSchemaDeps(schemaFileContent, allSchemas);
  const alive = withDependencies(
    findReferencedIdentifiers(remainingGroupContents, allSchemas),
    schemaDeps,
  );
  const touched = withDependencies(findReferencedIdentifiers(removedCode, allSchemas), schemaDeps);
  /* A schema that stays keeps what it is written with, such as the type it `satisfies`. */
  const staying = allSchemas.filter((name) => alive.has(name) || !touched.has(name));
  const kept = withDependencies(new Set(staying), schemaDeps);
  return allSchemas.filter((name) => !kept.has(name));
}

/* The schemas given, and every schema they depend on. */
function withDependencies(start: Set<string>, schemaDeps: Map<string, string[]>): Set<string> {
  const reached = new Set(start);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [schema, deps] of schemaDeps) {
      if (!reached.has(schema)) continue;
      for (const dep of deps) {
        if (!reached.has(dep)) {
          reached.add(dep);
          changed = true;
        }
      }
    }
  }
  return reached;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectSchemaNames(content: string): string[] {
  const names: string[] = [];
  for (const line of content.split("\n")) {
    const match = line.match(DECLARATION_RE);
    if (match?.[1]) names.push(match[1]);
  }
  return names;
}

/** Find which schema names appear as identifiers in group content (excluding imports) */
function findReferencedIdentifiers(groupContent: string, schemaNames: string[]): Set<string> {
  // Strip import lines — we only care about usage in actual code
  const codeOnly = groupContent
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("import"))
    .join("\n");

  const found = new Set<string>();
  for (const name of schemaNames) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(codeOnly)) found.add(name);
  }
  return found;
}

/** For each schema, find which other schemas it references */
function buildSchemaDeps(schemaContent: string, allSchemas: string[]): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  const lines = schemaContent.split("\n");
  const nameSet = new Set(allSchemas);
  let i = 0;

  while (i < lines.length) {
    const match = lines[i]?.match(DECLARATION_RE);
    if (!match?.[1]) {
      i++;
      continue;
    }

    const name = match[1];
    const endIdx = findBlockEnd(lines, i);
    const block = lines.slice(i, endIdx + 1).join("\n");

    const schemaDeps: string[] = [];
    for (const other of nameSet) {
      if (other === name) continue;
      if (new RegExp(`\\b${other}\\b`).test(block)) schemaDeps.push(other);
    }

    deps.set(name, schemaDeps);
    i = endIdx + 1;
  }

  return deps;
}

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
