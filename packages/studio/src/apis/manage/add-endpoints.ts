/**
 * Preview adding endpoints — generates code for new endpoints only,
 * then merges into existing files or creates new group files.
 */

import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import { generateCode } from "../generator";
import type { GenerateOptions } from "../generator/types";
import type { ImportLayout } from "../layout";
import { declaresEndpoints } from "../merge/declares-endpoints";
import { generateFingerprints } from "../merge/fingerprint";
import type { ParsedSpec } from "../parser/types";
import { appendEndpointsToGroup } from "./append-to-group";
import { exportedNames } from "./exported-names";
import { listedSelection } from "./listed-selection";
import { mergeSchemaFiles } from "./merge-schemas";
import { rebuildBarrel } from "./rebuild-barrel";
import { sourceWithNewGroups } from "./source-with-new-groups";
import type { AddResult, FileChange } from "./types";

/**
 * Generate a preview of what adding endpoints would produce.
 *
 * @param spec - Full parsed spec
 * @param endpointsToAdd - The endpoints to add, by group, as the import's files name them
 * @param options - Persisted generation options (selectedEndpoints is overridden)
 * @param existingFiles - Map of filePath → content for files currently on disk
 * @param layout - Where the import's files go
 * @returns AddResult with files to create/modify and new fingerprints
 */
export function previewAddEndpoints(
  spec: ParsedSpec,
  endpointsToAdd: Record<string, string[]>,
  options: GenerateOptions,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): AddResult {
  /* Picked as the import lists them; the generator selects as the specification names them. */
  const { selection } = listedSelection(spec, options.groupBy ?? "tag", endpointsToAdd);
  const genOptions: GenerateOptions = { ...options, selectedEndpoints: selection };
  const generated = generateCode(spec, genOptions, layout.importName);
  const files: FileChange[] = [];
  const newFingerprints: Record<string, string> = {};
  let barrel:
    | { existing: string; change: (content: string, action: "modify") => FileChange }
    | undefined;

  for (const genFile of generated) {
    const fps = generateFingerprints(genFile.content);
    Object.assign(newFingerprints, fps);

    const existingContent = existingFiles[genFile.path];
    const change = (content: string, action: FileChange["action"]): FileChange => ({
      path: genFile.path,
      content,
      action,
      generatedEndpoints: fps,
    });
    if (!existingContent) {
      files.push(change(genFile.content, "create"));
      continue;
    }

    // Schema file — merge new schemas
    if (genFile.path.endsWith("/schemas.ts") || genFile.path.endsWith("/types.ts")) {
      const schemaNames = Object.keys(fps).length > 0 ? [] : extractSchemaNames(genFile.content);
      const merged = mergeSchemaFiles(genFile.path, existingContent, genFile.content, schemaNames);
      if (merged !== existingContent) files.push(change(merged, "modify"));
      continue;
    }

    // Group file — append new endpoints
    const endpointNames = endpointsToAddForFile(genFile.path, endpointsToAdd, layout);
    if (endpointNames.length > 0) {
      const merged = appendEndpointsToGroup(
        genFile.path,
        existingContent,
        genFile.content,
        endpointNames,
      );
      files.push(change(merged, "modify"));
      continue;
    }

    /* An import generated flat keeps its endpoints in source.ts: the new ones
       are appended to it. A grouped source.ts, which lists its groups, gains
       the new ones through the source file update below, and the barrel only
       the re-exports it lacks: generated for the added groups alone, either
       file would drop every group already there. */
    if (genFile.path === layout.indexFile) {
      barrel = { existing: existingContent, change };
      continue;
    }
    const merged =
      declaresEndpoints(genFile.content) && declaresEndpoints(existingContent)
        ? appendEndpointsToGroup(
            genFile.path,
            existingContent,
            genFile.content,
            Object.values(endpointsToAdd).flat(),
          )
        : existingContent;
    if (merged !== existingContent) files.push(change(merged, "modify"));
  }
  const sourceFileUpdate = sourceWithNewGroups(endpointsToAdd, options, existingFiles, layout);
  /* Last, from every file as the other changes leave it. */
  if (barrel !== undefined) {
    const { existing, change } = barrel;
    const final = { ...existingFiles, ...contentsOf(files) };
    if (sourceFileUpdate) final[sourceFileUpdate.path] = sourceFileUpdate.content;
    const rebuilt = rebuildBarrel(layout, final, options.groupBy === "single");
    if (rebuilt !== undefined && rebuilt !== existing) files.push(change(rebuilt, "modify"));
  }

  return { files, sourceFileUpdate, newFingerprints };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find which endpoint names from `toAdd` go into a specific generated file */
function endpointsToAddForFile(
  filePath: string,
  endpointsToAdd: Record<string, string[]>,
  layout: ImportLayout,
): string[] {
  for (const [group, names] of Object.entries(endpointsToAdd)) {
    if (filePath === layout.groupFile(group)) return names;
  }
  return [];
}

function extractSchemaNames(content: string): string[] {
  return [...exportedNames(parseSource("schemas.ts", content).program.body).keys()];
}

function contentsOf(files: readonly FileChange[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.path, file.content]));
}
