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

/** Destructuring that names the builder heads, e.g. `const { query } = courier();`. */
const DESTRUCTURED_HEADS_RE = /const \{([^}]+)\} = courier\(/;

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
  const preamble = mergePreamble(existing.preamble, generated.preamble, endpointLines);
  const content = buildFile(importLines, preamble, generated, endpointLines, existing.trailingCode);
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

  /* Keep what the user wrote, drop what the spec dropped. An endpoint we
     generated before and the spec no longer describes is removed; one we never
     generated is the user's own and stays. */
  for (const existEp of existing.endpoints) {
    if (generatedNames.has(existEp.name)) continue;

    if (fingerprints.endpoints[existEp.name] === "removed") {
      changes.push({
        type: "removed",
        target: `endpoint:${existEp.name}`,
        detail: "no longer in spec",
      });
      continue;
    }

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

/**
 * Carry the builder heads across a merge.
 *
 * The existing file wins so a hand-renamed or reconfigured base survives, but a
 * head the merged endpoints now address is added to its destructuring — a spec
 * that grew its first write would otherwise leave `mutation` undeclared.
 */
function mergePreamble(existing: string[], generated: string[], endpointLines: string[]): string[] {
  const preamble = existing.length > 0 ? [...existing] : [...generated];

  const used = new Set<string>();
  for (const line of endpointLines) {
    const match = line.match(/^\s{4}\w+:\s*(query|mutation|stream|channel)\b/);
    if (match?.[1]) used.add(match[1]);
  }
  if (used.size === 0) return preamble;

  const index = preamble.findIndex((line) => DESTRUCTURED_HEADS_RE.test(line));
  if (index === -1) return preamble;

  const match = preamble[index]?.match(DESTRUCTURED_HEADS_RE);
  const declared = (match?.[1] ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  const merged = [...new Set([...declared, ...used])].sort();
  if (merged.length === declared.length) return preamble;

  preamble[index] = (preamble[index] ?? "").replace(
    DESTRUCTURED_HEADS_RE,
    `const { ${merged.join(", ")} } = courier(`,
  );
  return preamble;
}

function buildFile(
  importLines: string[],
  preamble: string[],
  generated: ReturnType<typeof parseExistingGroup>,
  endpointLines: string[],
  trailingCode: string[],
): string {
  const lines = [
    ...importLines,
    "",
    ...(preamble.length > 0 ? [...preamble, ""] : []),
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
