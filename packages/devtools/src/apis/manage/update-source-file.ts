/**
 * Add or remove group imports/entries from an existing source.ts file.
 *
 * Operates on source file text — no I/O.
 */

const IMPORT_RE = /^import\s+\{[^}]+\}\s+from\s+"\.\/([^"]+)";$/;
const GROUPS_OPEN_RE = /^\s*groups:\s*\{/;
const GROUP_ENTRY_RE = /^\s{4}(\w+),?$/;

/** Add new group imports and entries to source file */
export function addGroupsToSourceFile(
  existingContent: string,
  newGroups: Array<{ name: string; importPath: string }>,
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
        result.push(`import { ${g.name} } from "${g.importPath}";`);
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
            result.push(`    ${g.name},`);
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
