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

import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { findGroupDeclaration } from "../manage/group-declaration";
import { ownValue } from "../own-value";
import { mergeImports } from "./merge-imports";
import { parseExistingGroup } from "./parse-existing";
import { type MergedEntry, placeUnderPrefix } from "./place-under-prefix";
import { renameBase } from "./rename-base";
import type { FingerprintResult, MergeChange, MergeResult, MergeStatus } from "./types";

export function mergeGroupFile(
  existingContent: string,
  generatedContent: string,
  fingerprints: FingerprintResult,
): MergeResult {
  const existing = parseExistingGroup(existingContent);
  const generated = parseExistingGroup(generatedContent);
  const changes: MergeChange[] = [];

  const merged = mergeEndpoints(existing, generated, fingerprints, changes).map((entry) => ({
    ...entry,
    code: renameBase(entry.code, generated.baseName, existing.baseName),
  }));
  /* A kept endpoint's path is relative to the file's prefix, a generated one's to the spec's. */
  const filePrefix =
    findGroupDeclaration(parseSource("group.ts", existingContent).program)?.prefix ?? null;
  const placed = placeUnderPrefix(merged, existing.baseName, filePrefix, generated.prefix);
  const prefix = placed?.prefix ?? generated.prefix;
  if (placed !== null && prefix !== generated.prefix)
    changes.push({
      type: "updated",
      target: "prefix",
      detail: `${prefix}, so every endpoint keeps its URL`,
    });
  const endpointLines = (placed?.entries ?? merged).flatMap((e) =>
    e.comment ? [e.comment, e.code] : [e.code],
  );
  const preamble = mergePreamble(existing.preamble, generated.preamble);
  /* A name the file imported that nothing merged uses any more goes with the code that used it. */
  const code = [...preamble, ...generated.header, ...endpointLines, ...existing.trailingCode].join(
    "\n",
  );
  const importLines = mergeImports(existing.imports, generated.imports, changes, code);
  const content = buildFile(
    importLines,
    preamble,
    { ...generated, header: withPrefix(generated.header, generated.prefix, prefix) },
    endpointLines,
    existing.trailingCode,
  );
  const status = resolveStatus(changes);

  return { content, status, changes };
}

function mergeEndpoints(
  existing: ReturnType<typeof parseExistingGroup>,
  generated: ReturnType<typeof parseExistingGroup>,
  fingerprints: FingerprintResult,
  changes: MergeChange[],
): MergedEntry[] {
  const result: MergedEntry[] = [];
  const existingByName = new Map(existing.endpoints.map((e) => [e.name, e]));
  const generatedNames = new Set(generated.endpoints.map((e) => e.name));

  /* Process generated endpoints in spec order */
  for (const genEp of generated.endpoints) {
    const status = ownValue(fingerprints.endpoints, genEp.name);
    const existEp = existingByName.get(genEp.name);

    if (!existEp || status === "safe" || status === "new") {
      result.push({ comment: genEp.comment, code: genEp.code, kept: false });
      const changeType = status === "new" || !existEp ? "added" : "updated";
      changes.push({ type: changeType, target: `endpoint:${genEp.name}`, detail: "from spec" });
      continue;
    }

    if (status === "modified") {
      /* An endpoint is one declarative expression now, with no closure to
         graft a regenerated head onto. What the user wrote is what they meant,
         so it stays whole; the change list says the spec moved under it. */
      result.push({ comment: existEp.comment ?? genEp.comment, code: existEp.code, kept: true });
      changes.push({
        type: "preserved",
        target: `endpoint:${genEp.name}`,
        detail: "edited by hand; the spec changed under it",
      });
      continue;
    }

    /* Fallback: use generated */
    result.push({ comment: genEp.comment, code: genEp.code, kept: false });
    changes.push({ type: "updated", target: `endpoint:${genEp.name}`, detail: "from spec" });
  }

  /* Keep what the user wrote, drop what the spec dropped. An endpoint we
     generated before and the spec no longer describes is removed; one we never
     generated is the user's own and stays. */
  for (const existEp of existing.endpoints) {
    if (generatedNames.has(existEp.name)) continue;

    if (ownValue(fingerprints.endpoints, existEp.name) === "removed") {
      changes.push({
        type: "removed",
        target: `endpoint:${existEp.name}`,
        detail: "no longer in spec",
      });
      continue;
    }

    result.push({ comment: existEp.comment, code: existEp.code, kept: true });
    changes.push({
      type: "preserved",
      target: `endpoint:${existEp.name}`,
      detail: "user-added endpoint",
    });
  }

  return result;
}

/* The declaration's head with the prefix it names changed, when it changes. */
function withPrefix(header: string[], from: string, to: string): string[] {
  if (from === to) return header;
  return header.map((line) =>
    line.replace(`prefix: ${JSON.stringify(from)}`, `prefix: ${JSON.stringify(to)}`),
  );
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
