/**
 * Preview adding endpoints — generates code for new endpoints only,
 * then merges into existing files or creates new group files.
 */

import { generateCode, groupLocalName } from "../generator";
import type { GenerateOptions } from "../generator/types";
import type { ImportLayout } from "../layout";
import { generateFingerprints } from "../merge/fingerprint";
import type { ParsedSpec } from "../parser/types";
import { appendEndpointsToGroup } from "./append-to-group";
import { mergeSchemaFiles } from "./merge-schemas";
import type { AddResult, FileChange } from "./types";
import { addGroupsToSourceFile } from "./update-source-file";

/**
 * Generate a preview of what adding endpoints would produce.
 *
 * @param spec - Full parsed spec
 * @param endpointsToAdd - Map of groupName → endpointName[] to add
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
  const genOptions: GenerateOptions = { ...options, selectedEndpoints: endpointsToAdd };
  const generated = generateCode(spec, genOptions, layout.importName);
  const files: FileChange[] = [];
  const newFingerprints: Record<string, string> = {};

  for (const genFile of generated) {
    const fps = generateFingerprints(genFile.content);
    Object.assign(newFingerprints, fps);

    const existingContent = existingFiles[genFile.path];
    if (!existingContent) {
      files.push({ path: genFile.path, content: genFile.content, action: "create" });
      continue;
    }

    // Schema file — merge new schemas
    if (genFile.path.endsWith("/schemas.ts") || genFile.path.endsWith("/types.ts")) {
      const schemaNames = Object.keys(fps).length > 0 ? [] : extractSchemaNames(genFile.content);
      const merged = mergeSchemaFiles(existingContent, genFile.content, schemaNames);
      if (merged !== existingContent) {
        files.push({ path: genFile.path, content: merged, action: "modify" });
      }
      continue;
    }

    // Group file — append new endpoints
    const endpointNames = endpointsToAddForFile(genFile.path, endpointsToAdd, layout);
    if (endpointNames.length > 0) {
      const merged = appendEndpointsToGroup(existingContent, genFile.content, endpointNames);
      files.push({ path: genFile.path, content: merged, action: "modify" });
      continue;
    }

    // Source file or other — use generated as-is if different
    if (genFile.content !== existingContent) {
      files.push({ path: genFile.path, content: genFile.content, action: "modify" });
    }
  }

  // Source file update for new groups
  const newGroupNames = findNewGroups(endpointsToAdd, existingFiles, layout);
  let sourceFileUpdate: AddResult["sourceFileUpdate"];
  if (newGroupNames.length > 0) {
    const sourcePath = layout.sourceFile;
    const existingSource = existingFiles[sourcePath] ?? "";
    if (existingSource) {
      const updated = addGroupsToSourceFile(
        existingSource,
        newGroupNames.map((name) => ({
          name,
          local: groupLocalName(name, layout.sourceBinding),
          importPath: layout.groupSpecifier(name, "index"),
        })),
      );
      sourceFileUpdate = { path: sourcePath, content: updated };
    }
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

/** Detect groups whose file is not on disk yet */
function findNewGroups(
  endpointsToAdd: Record<string, string[]>,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
): string[] {
  return Object.keys(endpointsToAdd).filter(
    (group) => !Object.hasOwn(existingFiles, layout.groupFile(group)),
  );
}

const SCHEMA_DECL_RE = /^export\s+(?:const|type|interface)\s+(\w+)/;

function extractSchemaNames(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.match(SCHEMA_DECL_RE)?.[1])
    .filter((n): n is string => n !== undefined);
}
