/**
 * Add or remove group imports/entries from an existing source.ts file.
 *
 * Operates on source file text — no I/O.
 */

/* `import { pets } from "./pets/index";`, or with an alias, `import { pets as group_pets } …`. */
const IMPORT_RE = /^import\s+\{\s*(\w+)(?:\s+as\s+\w+)?\s*\}\s+from\s+"\.\/[^"]+";$/;
const GROUPS_OPEN_RE = /^\s*groups:\s*\{/;
/* `    pets,`, or with an alias, `    pets: group_pets,`. */
const GROUP_ENTRY_RE = /^\s{4}(\w+)(?::\s*\w+)?,?$/;

/** A group to add: its name, the name source.ts imports it under, and the module it lives in. */
export interface SourceGroupImport {
  name: string;
  local: string;
  importPath: string;
}

/** Add new group imports and entries to source file */
export function addGroupsToSourceFile(
  existingContent: string,
  newGroups: SourceGroupImport[],
): string {
  if (newGroups.length === 0) return existingContent;

  const lines = existingContent.split("\n");
  const result: string[] = [];
  let addedImports = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    result.push(line);

    // Insert new imports after last import line
    if (!addedImports && line.startsWith("import") && !(lines[i + 1] ?? "").startsWith("import")) {
      for (const g of newGroups) {
        const imported = g.local === g.name ? g.name : `${g.name} as ${g.local}`;
        result.push(`import { ${imported} } from "${g.importPath}";`);
      }
      addedImports = true;
    }

    // Insert group entries before closing `},` of groups block
    if (GROUPS_OPEN_RE.test(line)) {
      while (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i] ?? "";
        if (nextLine.trim().startsWith("},") || nextLine.trim() === "}") {
          for (const g of newGroups) {
            result.push(g.local === g.name ? `    ${g.name},` : `    ${g.name}: ${g.local},`);
          }
          result.push(nextLine);
          break;
        }
        result.push(nextLine);
      }
    }
  }

  return result.join("\n");
}

/** Remove group imports and entries from source file */
export function removeGroupsFromSourceFile(existingContent: string, groupNames: string[]): string {
  if (groupNames.length === 0) return existingContent;

  const removeSet = new Set(groupNames);
  const lines = existingContent.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Skip import lines for removed groups
    const importMatch = line.match(IMPORT_RE);
    if (importMatch?.[1] && removeSet.has(importMatch[1])) continue;

    // Skip group entries for removed groups
    const entryMatch = line.match(GROUP_ENTRY_RE);
    if (entryMatch?.[1] && removeSet.has(entryMatch[1])) continue;

    // Skip JSDoc comments for removed groups (look-ahead)
    result.push(line);
  }

  return result.join("\n");
}
