/**
 * Removes specific endpoints from a group file, rebuilding the result.
 *
 * Also cleans up imports that are no longer referenced by remaining endpoints.
 * Returns null if all endpoints are removed (file should be deleted).
 */

import { parseExistingGroup } from "../merge/parse-existing";
import type { ExistingGroupInfo, ParsedImport } from "../merge/types";

/**
 * Remove named endpoints from a group file.
 *
 * @returns Updated file content, or null if all endpoints removed
 */
export function removeEndpointsFromGroup(
  existingContent: string,
  endpointNamesToRemove: string[],
): string | null {
  const parsed = parseExistingGroup(existingContent);
  const removeSet = new Set(endpointNamesToRemove);
  const remaining = parsed.endpoints.filter((ep) => !removeSet.has(ep.name));

  if (remaining.length === 0) return null;

  return rebuildGroupFile(parsed, remaining);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function rebuildGroupFile(
  parsed: ExistingGroupInfo,
  endpoints: Array<{ name: string; code: string; comment?: string }>,
): string {
  const lines: string[] = [];

  // Build body first so we can scan for used identifiers
  const bodyLines = buildBody(parsed, endpoints);
  const body = bodyLines.join("\n");

  // Filter imports to only those still referenced in the body
  const cleanedImports = cleanUnusedImports(parsed.imports, body);
  lines.push(...cleanedImports);
  lines.push("");
  lines.push(...bodyLines);
  lines.push("");

  return lines.join("\n");
}

function buildBody(
  parsed: ExistingGroupInfo,
  endpoints: Array<{ name: string; code: string; comment?: string }>,
): string[] {
  const lines: string[] = [];

  lines.push(`export const ${parsed.groupName} = defineGroup({`);
  lines.push(`  prefix: "${parsed.prefix}",`);
  lines.push("  endpoints: {");

  for (const ep of endpoints) {
    if (ep.comment) lines.push(ep.comment);
    lines.push(ep.code);
  }

  lines.push("  },");
  lines.push("});");

  if (parsed.trailingCode.length > 0) {
    lines.push("");
    lines.push(...parsed.trailingCode);
  }

  return lines;
}

/**
 * Filter import specifiers to only those referenced in body code.
 * Keeps structural imports (defineGroup, endpoint, z) always.
 */
function cleanUnusedImports(imports: ParsedImport[], body: string): string[] {
  const result: string[] = [];

  for (const imp of imports) {
    // Namespace imports (import * as X) — keep if used
    if (imp.namespaceImport) {
      if (new RegExp(`\\b${imp.namespaceImport}\\b`).test(body)) {
        result.push(imp.raw);
      }
      continue;
    }

    // Named imports — filter to only used specifiers
    const usedNames = imp.names.filter((n) => new RegExp(`\\b${n}\\b`).test(body));
    const usedTypes = imp.typeNames.filter((n) => new RegExp(`\\b${n}\\b`).test(body));

    if (usedNames.length === 0 && usedTypes.length === 0) continue;

    const specifiers = [...usedNames, ...usedTypes.map((t) => `type ${t}`)];
    result.push(`import { ${specifiers.join(", ")} } from "${imp.source}";`);
  }

  return result;
}
