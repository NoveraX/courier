/**
 * Helpers for linking discovered groups to their sources via import analysis.
 */

import type { ScannedGroup, ScannedSource } from "./types";

/** Link a discovered group to its source via placeholder or same-file matching */
export function resolveGroup(
  group: ScannedGroup,
  sourceMap: Map<string, ScannedSource>,
  groupsByImport: Map<string, ScannedGroup[]>,
  filePath: string,
): void {
  /* Try to fill a placeholder from import analysis */
  for (const [, placeholders] of groupsByImport) {
    const ph = placeholders.find((g) => g.name === group.name && !g.filePath);
    if (ph) {
      Object.assign(ph, group);
      return;
    }
  }
  /* Fallback: direct source matching (same file) */
  for (const src of sourceMap.values()) {
    if (src.groups.some((g) => g.name === group.name)) return;
    if (src.filePath === filePath) {
      src.groups.push(group);
      return;
    }
  }
}

/** Extract group variable names from import statements */
export function extractImportedGroups(content: string): string[] {
  const names: string[] = [];
  const importRe = /import\s+\{([^}]+)\}\s+from\s+["']\.\/([^"']+)["']/g;

  for (const match of content.matchAll(importRe)) {
    const imported = (match[1] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of imported) {
      /* Skip type imports and non-camelCase names */
      if (name.startsWith("type ")) continue;
      if (/^[a-z]/.test(name)) names.push(name);
    }
  }

  return names;
}

/** Link discovered groups back to their source */
export function linkGroupsToSources(
  sourceMap: Map<string, ScannedSource>,
  groupsByImport: Map<string, ScannedGroup[]>,
): void {
  for (const [sourceName, groups] of groupsByImport) {
    const source = sourceMap.get(sourceName);
    if (!source) continue;
    for (const group of groups) {
      /* Only add groups that were fully resolved (have filePath) */
      if (group.filePath && !source.groups.some((g) => g.name === group.name)) {
        source.groups.push(group);
      }
    }
  }
}
