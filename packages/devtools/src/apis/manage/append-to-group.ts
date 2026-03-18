/**
 * Appends new endpoints to an existing group file.
 *
 * Merges imports and inserts endpoint code blocks before the closing `});`.
 */

import { mergeImports } from "../merge/merge-imports";
import { parseExistingGroup } from "../merge/parse-existing";
import type { MergeChange } from "../merge/types";

/**
 * Merge new endpoint code into an existing group file.
 *
 * @param existingContent - Current file on disk
 * @param generatedContent - Freshly generated file with only new endpoints
 * @param endpointNames - Names of endpoints to extract from generated
 * @returns Merged file content
 */
export function appendEndpointsToGroup(
  existingContent: string,
  generatedContent: string,
  endpointNames: string[],
): string {
  const existing = parseExistingGroup(existingContent);
  const generated = parseExistingGroup(generatedContent);
  const nameSet = new Set(endpointNames);

  // Merge imports
  const changes: MergeChange[] = [];
  const importLines = mergeImports(existing.imports, generated.imports, changes);

  // Extract only the requested endpoints from generated file
  const newEndpoints = generated.endpoints.filter((ep) => nameSet.has(ep.name));
  if (newEndpoints.length === 0) return existingContent;

  return rebuildFile(importLines, existing, newEndpoints);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rebuildFile(
  importLines: string[],
  existing: ReturnType<typeof parseExistingGroup>,
  newEndpoints: Array<{ name: string; code: string; comment?: string }>,
): string {
  const lines: string[] = [];

  // Imports
  lines.push(...importLines);
  lines.push("");

  // Group header: export const X = defineGroup({
  lines.push(`export const ${existing.groupName} = defineGroup({`);
  lines.push(`  prefix: "${existing.prefix}",`);
  lines.push("  endpoints: {");

  // Existing endpoints
  for (const ep of existing.endpoints) {
    if (ep.comment) lines.push(ep.comment);
    lines.push(ep.code);
  }

  // New endpoints
  for (const ep of newEndpoints) {
    if (ep.comment) lines.push(ep.comment);
    lines.push(ep.code);
  }

  lines.push("  },");
  lines.push("});");

  // Trailing code
  if (existing.trailingCode.length > 0) {
    lines.push("");
    lines.push(...existing.trailingCode);
  }

  lines.push("");
  return lines.join("\n");
}
