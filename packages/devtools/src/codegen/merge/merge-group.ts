/**
 * Core merge logic: combines existing (user-modified) and generated group files.
 *
 * Merge rules:
 * - Imports: union (generated + user), deduped
 * - Safe endpoints (hash matches): overwrite with generated
 * - Modified endpoints (user changed): preserve user body, update config from spec
 * - New endpoints: add from generated
 * - User-added endpoints (not in spec): preserve
 * - Non-endpoint code (trailing helpers): preserve
 */

import { mergeImports } from "./merge-imports";
import { parseExistingGroup } from "./parse-existing";
import { splitEndpoint } from "./split-endpoint";
import type { FingerprintResult, MergeChange, MergeResult, MergeStatus } from "./types";

export function mergeGroupFile(
  existingContent: string,
  generatedContent: string,
  fingerprints: FingerprintResult,
): MergeResult {
  const existing = parseExistingGroup(existingContent);
  const generated = parseExistingGroup(generatedContent);
  const changes: MergeChange[] = [];

  const importLines = mergeImports(existing.imports, generated.imports, changes);
  const endpointLines = mergeEndpoints(existing, generated, fingerprints, changes);
  const content = buildFile(importLines, generated, endpointLines, existing.trailingCode);
  const status = resolveStatus(changes);

  return { content, status, changes };
}

function mergeEndpoints(
  existing: ReturnType<typeof parseExistingGroup>,
  generated: ReturnType<typeof parseExistingGroup>,
  fingerprints: FingerprintResult,
  changes: MergeChange[],
): string[] {
  const result: string[] = [];
  const existingByName = new Map(existing.endpoints.map((e) => [e.name, e]));
  const generatedNames = new Set(generated.endpoints.map((e) => e.name));

  /* Process generated endpoints in spec order */
  for (const genEp of generated.endpoints) {
    const status = fingerprints.endpoints[genEp.name];
    const existEp = existingByName.get(genEp.name);

    if (!existEp || status === "safe" || status === "new") {
      appendEndpoint(result, genEp.comment, genEp.code);
      const changeType = status === "new" || !existEp ? "added" : "updated";
      changes.push({ type: changeType, target: `endpoint:${genEp.name}`, detail: "from spec" });
      continue;
    }

    if (status === "modified") {
      const merged = mergeEndpointCode(existEp.code, genEp.code);
      appendEndpoint(result, genEp.comment ?? existEp.comment, merged);
      changes.push({
        type: "preserved",
        target: `endpoint:${genEp.name}`,
        detail: "user body preserved, config updated",
      });
      continue;
    }

    /* Fallback: use generated */
    appendEndpoint(result, genEp.comment, genEp.code);
    changes.push({ type: "updated", target: `endpoint:${genEp.name}`, detail: "from spec" });
  }

  /* Preserve user-added endpoints not in spec */
  for (const existEp of existing.endpoints) {
    if (generatedNames.has(existEp.name)) continue;

    appendEndpoint(result, existEp.comment, existEp.code);
    changes.push({
      type: "preserved",
      target: `endpoint:${existEp.name}`,
      detail: "user-added endpoint",
    });
  }

  return result;
}

/** Merge a modified endpoint: new config head + existing user body */
function mergeEndpointCode(existingCode: string, generatedCode: string): string {
  const existParts = splitEndpoint(existingCode);
  const genParts = splitEndpoint(generatedCode);

  /* If we can't split either, fall back to existing (preserve user code) */
  if (!existParts || !genParts) return existingCode;

  return genParts.head + existParts.body;
}

function appendEndpoint(lines: string[], comment: string | undefined, code: string): void {
  if (comment) lines.push(comment);
  lines.push(code);
}

function buildFile(
  importLines: string[],
  generated: ReturnType<typeof parseExistingGroup>,
  endpointLines: string[],
  trailingCode: string[],
): string {
  const lines = [
    ...importLines,
    "",
    `export const ${generated.groupName} = defineGroup({`,
    `  prefix: "${generated.prefix}",`,
    "  endpoints: {",
    ...endpointLines,
    "  },",
    "});",
    "",
  ];

  if (trailingCode.length > 0) {
    lines.push(...trailingCode, "");
  }

  return lines.join("\n");
}

function resolveStatus(changes: MergeChange[]): MergeStatus {
  if (changes.some((c) => c.type === "preserved")) return "merged";
  if (changes.length === 0) return "safe";
  return "safe";
}
