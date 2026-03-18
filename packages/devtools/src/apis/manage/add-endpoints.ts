/**
 * Preview adding endpoints — generates code for new endpoints only,
 * then merges into existing files or creates new group files.
 */

import { generateCode } from "../generator";
import type { GenerateOptions } from "../generator/types";
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
 * @returns AddResult with files to create/modify and new fingerprints
 */
export function previewAddEndpoints(
  spec: ParsedSpec,
  endpointsToAdd: Record<string, string[]>,
  options: GenerateOptions,
  existingFiles: Record<string, string>,
): AddResult {
  const genOptions: GenerateOptions = { ...options, selectedEndpoints: endpointsToAdd };
  const generated = generateCode(spec, genOptions);
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
    const endpointNames = endpointsToAddForFile(genFile.path, endpointsToAdd);
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
  const newGroupNames = findNewGroups(endpointsToAdd, existingFiles, options);
  let sourceFileUpdate: AddResult["sourceFileUpdate"];
  if (newGroupNames.length > 0) {
    const sourcePath = `${options.outputDir.replace(/\/+$/, "")}/${options.sourceName}/source.ts`;
    const existingSource = existingFiles[sourcePath] ?? "";
    if (existingSource) {
      const updated = addGroupsToSourceFile(
        existingSource,
        newGroupNames.map((n) => ({ name: n, importPath: `./${n}` })),
      );
      sourceFileUpdate = { path: sourcePath, content: updated };
    }
  }

  return { files, sourceFileUpdate, newFingerprints };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find which endpoint names from `toAdd` map to a specific generated file */
function endpointsToAddForFile(
  filePath: string,
  endpointsToAdd: Record<string, string[]>,
): string[] {
  for (const [group, names] of Object.entries(endpointsToAdd)) {
    if (filePath.includes(`/${group}/`) || filePath.includes(`/${group}.ts`)) {
      return names;
    }
  }
  return [];
}

/** Detect groups that don't exist on disk yet */
function findNewGroups(
  endpointsToAdd: Record<string, string[]>,
  existingFiles: Record<string, string>,
  options: GenerateOptions,
): string[] {
  const baseDir = `${options.outputDir.replace(/\/+$/, "")}/${options.sourceName}`;
  return Object.keys(endpointsToAdd).filter((groupName) => {
    const groupDir = `${baseDir}/${groupName}`;
    return !Object.keys(existingFiles).some((p) => p.startsWith(groupDir));
  });
}

const SCHEMA_DECL_RE = /^export\s+(?:const|type|interface)\s+(\w+)/;

function extractSchemaNames(content: string): string[] {
  return content
    .split("\n")
    .map((l) => l.match(SCHEMA_DECL_RE)?.[1])
    .filter((n): n is string => n !== undefined);
}
