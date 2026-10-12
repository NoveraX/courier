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
 *
 * Both files are cut into their parts by their syntax, and the merged file is
 * read back the same way before it is offered: a file that cannot be cut into
 * whole-line parts, or a merge that does not read back as what it meant to
 * write, is a conflict, never a quiet success.
 */

import { type DeclarationLayout, readLayout } from "./declaration-layout";
import { holdsMerge } from "./holds-merge";
import { mergeEndpoints } from "./merge-endpoints";
import { mergeImports } from "./merge-imports";
import { buildFile, resolveStatus } from "./merged-file";
import { type MergedShell, mergedShell } from "./merged-shell";
import { missingHelpers } from "./missing-helpers";
import { groupInfo } from "./parse-existing";
import { type MergedEntry, placeUnderPrefix } from "./place-under-prefix";
import { renameBase, usesBase } from "./rename-base";
import { withStreamBuilder } from "./stream-preamble";
import type { ExistingGroupInfo, FingerprintResult, MergeChange, MergeResult } from "./types";

/** The name a generated file builds its streams of events from. */
const STREAM = "stream";

/** Why a merge leaves the file to the user rather than writing it. */
const UNREADABLE = "Studio cannot cut the file on disk into its parts, so it cannot keep its edits";
const MISREAD =
  "Studio's merge of the file does not read back as it was meant to, so it cannot keep its edits";
const UNPLACEABLE =
  "The group's prefix changed, and Studio cannot write every endpoint you kept under a prefix that keeps its URL — one names its path other than as a string";

/** A file laid out for a merge, and its parts. */
interface Side {
  layout: DeclarationLayout;
  info: ExistingGroupInfo;
}

/**
 * Merge a freshly generated group file, or flat source, into the version on
 * disk, keeping what the user wrote: their endpoints, the options they gave
 * the declaration, the code around it.
 *
 * @param existingContent - The file on disk
 * @param generatedContent - The file the import generated
 * @param fingerprints - How each endpoint of the file compares with what Studio wrote
 * @returns The merged file; a `conflict` holding the generated file when the
 *   merge cannot keep the file's edits
 * @example
 * ```ts
 * mergeGroupFile(onDisk, generated, classifyEndpoints(code, stored, names)).status; // "merged"
 * ```
 */
export function mergeGroupFile(
  existingContent: string,
  generatedContent: string,
  fingerprints: FingerprintResult,
): MergeResult {
  const fresh = side(readLayout(generatedContent));
  const read = fresh && side(readLayout(existingContent, fresh.layout.declaration.name));
  if (fresh === null || read === null) return conflict(generatedContent, UNREADABLE);
  const changes: MergeChange[] = [];
  const merged = renamed(mergeEndpoints(read.info, fresh.info, fingerprints, changes), read, fresh);
  const own = withFirstStream(read, merged);
  if (own === null) return conflict(generatedContent, UNREADABLE);
  const placed = underPrefix(merged, own, fresh, changes);
  if (placed === null) return conflict(generatedContent, UNPLACEABLE);
  const { prefix, entries } = placed;
  /* The declaration keeps the options the user added; the generator's come from the spec. */
  const shell = mergedShell(own.layout, fresh.layout, prefix);
  if (shell === null) return conflict(generatedContent, UNREADABLE);
  for (const option of shell.kept) {
    changes.push({ type: "preserved", target: `option:${option}`, detail: "added by hand" });
  }
  const content = assemble(own, fresh, entries, shell, changes);
  if (!holdsMerge(content, own.layout, fresh.layout, entries)) {
    return conflict(generatedContent, MISREAD);
  }
  return { content, status: resolveStatus(changes), changes };
}

function side(layout: DeclarationLayout | null): Side | null {
  return layout === null ? null : { layout, info: groupInfo(layout) };
}

/* Each endpoint written in the names the file gives its builders. */
function renamed(entries: MergedEntry[], own: Side, fresh: Side): MergedEntry[] {
  const stream = own.info.streamBaseName ?? STREAM;
  return entries.map((entry) => ({
    ...entry,
    code: renameBase(
      renameBase(entry.code, fresh.info.baseName, own.info.baseName),
      STREAM,
      stream,
    ),
  }));
}

/* The prefix the merged group declares, and each endpoint's path written under it;
   `null` when no prefix keeps every endpoint's URL, which the user then decides. */
function underPrefix(
  entries: MergedEntry[],
  own: Side,
  fresh: Side,
  changes: MergeChange[],
): { prefix: string; entries: MergedEntry[] } | null {
  /* A kept endpoint's path is relative to the file's prefix, a generated one's to the spec's. */
  const bases = [own.info.baseName, own.info.streamBaseName ?? STREAM];
  const placed = placeUnderPrefix(entries, bases, own.layout.declaration.prefix, fresh.info.prefix);
  if (placed === null) return null;
  if (placed.prefix !== fresh.info.prefix) {
    changes.push({
      type: "updated",
      target: "prefix",
      detail: `${placed.prefix}, so every endpoint keeps its URL`,
    });
  }
  return placed;
}

/* The file, naming the stream builder when it gets its first stream of events from the spec. */
function withFirstStream(own: Side, entries: readonly MergedEntry[]): Side | null {
  const first =
    own.info.streamBaseName === null &&
    own.info.preamble.length > 0 &&
    entries.some((entry) => usesBase(entry.code, STREAM));
  if (!first) return own;
  return side(readLayout(withStreamBuilder(own.layout), own.layout.declaration.name));
}

/* The merged file's text: the file's own code around the merged declaration and endpoints. */
function assemble(
  own: Side,
  fresh: Side,
  entries: readonly MergedEntry[],
  shell: MergedShell,
  changes: MergeChange[],
): string {
  const { head, trailingCode } = own.info;
  /* What the file already declares wins, so a base someone renamed or
     configured survives; the generated one is used only for a file that had none. */
  const preamble = own.info.preamble.length > 0 ? own.info.preamble : fresh.info.preamble;
  const endpoints = entries.flatMap((e) => [e.note, e.comment, e.code].filter(isText));
  const helpers = missingHelpers(own.layout, fresh.layout, changes);
  const gap = trailingCode.length > 0 && helpers.length > 0 ? [""] : [];
  const trailing = [...trailingCode, ...gap, ...helpers];
  const { header, footer } = shell;
  /* A name the file imported that nothing merged uses any more goes with the code that used it. */
  const code = [...head, ...preamble, ...header, ...endpoints, ...footer, ...trailing];
  const imports = mergeImports(own.info.imports, fresh.info.imports, changes, code.join("\n"));
  return buildFile({ head, imports, preamble, header, endpoints, footer, trailing });
}

/* The generated file, for a file on disk the merge cannot keep whole. */
function conflict(generatedContent: string, detail: string): MergeResult {
  return {
    content: generatedContent,
    status: "conflict",
    changes: [{ type: "updated", target: "file", detail }],
  };
}

function isText(part: string | undefined): part is string {
  return part !== undefined && part !== "";
}
