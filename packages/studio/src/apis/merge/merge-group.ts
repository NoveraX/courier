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
  const endpointLines = mergeEndpoints(existing, generated, fingerprints, changes).map((line) =>
    renameBase(line, generated.baseName, existing.baseName),
  );
  const preamble = mergePreamble(existing.preamble, generated.preamble);
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
      /* An endpoint is one declarative expression now, with no closure to
         graft a regenerated head onto. What the user wrote is what they meant,
         so it stays whole; the change list says the spec moved under it. */
      appendEndpoint(result, existEp.comment ?? genEp.comment, existEp.code);
      changes.push({
        type: "preserved",
        target: `endpoint:${genEp.name}`,
        detail: "edited by hand; the spec changed under it",
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

function appendEndpoint(lines: string[], comment: string | undefined, code: string): void {
  if (comment) lines.push(comment);
  lines.push(code);
}

/**
 * Say what a generated endpoint says, in the name this file uses for the base.
 *
 * A person may have renamed the destructuring, or kept the base whole and
 * reached through it. Their name is the one that resolves in their file.
 */
function renameBase(line: string, from: string, to: string): string {
  if (from === to) return line;
  const base = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return line.replace(new RegExp(`(^\\s*\\w+:\\s*)${base}\\b`), `$1${to}`);
}

/**
 * Carry the base across a merge.
 *
 * What the file already declares wins, so a base someone renamed or configured
 * survives regeneration; the generated one is used only for a file that had
 * none.
 */
function mergePreamble(existing: string[], generated: string[]): string[] {
  return existing.length > 0 ? [...existing] : [...generated];
}

function buildFile(
  importLines: string[],
  preamble: string[],
  generated: ReturnType<typeof parseExistingGroup>,
  endpointLines: string[],
  trailingCode: string[],
): string {
  /* The declaration is taken from the freshly generated file — that is where a
     changed baseURL or prefix arrives — and only the endpoints between are
     merged. A group and a flat source differ only in what that shell says. */
  const header =
    generated.header.length > 0
      ? generated.header
      : [
          `export const ${generated.groupName} = defineGroup({`,
          `  prefix: "${generated.prefix}",`,
          "  endpoints: {",
        ];
  const footer = generated.footer.length > 0 ? generated.footer : ["  },", "});"];

  const lines = [
    ...importLines,
    "",
    ...(preamble.length > 0 ? [...preamble, ""] : []),
    ...header,
    ...endpointLines,
    ...footer,
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
