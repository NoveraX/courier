/**
 * Preview adding endpoints — generates code for new endpoints only,
 * then merges into existing files or creates new group files.
 */

import { parseSource } from "../../server/mocks-edit/plan/parse-source";
import type { GeneratedFile, GenerateOptions } from "../generator/types";
import type { ImportLayout } from "../layout";
import { generateFingerprints } from "../merge/fingerprint";
import { ownValue } from "../own-value";
import { TOP_LEVEL } from "../parser/top-level";
import type { ParsedSpec } from "../parser/types";
import { addedEndpointsCode } from "./added-endpoints-code";
import { appendEndpointsToGroup } from "./append-to-group";
import { exportedNames } from "./exported-names";
import { listedSelection } from "./listed-selection";
import { mergeSchemaFiles } from "./merge-schemas";
import { newGroupsOf } from "./new-groups";
import { rebuildBarrel } from "./rebuild-barrel";
import { sourceAfterAdd } from "./source-after-add";
import type { AddResult, FileChange } from "./types";
import { withInnerGroups } from "./with-inner-groups";

/**
 * Generate a preview of what adding endpoints would produce.
 *
 * @param spec - Full parsed spec
 * @param endpointsToAdd - The endpoints to add, by group, as the import's files name them
 * @param options - Persisted generation options (selectedEndpoints is overridden)
 * @param existingFiles - Map of filePath → content for files currently on disk
 * @param layout - Where the import's files go
 * @param generated - The code generated for the endpoints, as the project formats it; generated here when not given
 * @returns AddResult with files to create/modify and new fingerprints
 */
export function previewAddEndpoints(
  spec: ParsedSpec,
  endpointsToAdd: Record<string, string[]>,
  options: GenerateOptions,
  existingFiles: Record<string, string>,
  layout: ImportLayout,
  generated: readonly GeneratedFile[] = addedEndpointsCode(spec, endpointsToAdd, options, layout),
): AddResult {
  const { selection } = listedSelection(spec, options.groupBy ?? "tag", endpointsToAdd);
  const files: FileChange[] = [];
  const newFingerprints: Record<string, string> = {};
  let barrel: Pending | undefined;
  let source: (Pending & { generated: string }) | undefined;

  for (const genFile of generated) {
    /* The proxy caller is written whole for the endpoints the import ends up with. */
    if (genFile.path === layout.proxyFile) continue;
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

    /* The source and the barrel are changed last, from what the rest leaves:
       generated for the endpoints added alone, either would drop every
       endpoint and group already there. */
    if (genFile.path === layout.sourceFile) {
      source = { existing: existingContent, change, generated: genFile.content };
      continue;
    }
    if (genFile.path === layout.indexFile) {
      barrel = { existing: existingContent, change };
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
    }
  }
  const created = newGroupsOf(spec, options.groupBy ?? "tag", selection, existingFiles, layout);
  const outer = created.filter((group) => group.parent === undefined).map((group) => group.name);
  if (source !== undefined) {
    const own = ownValue(endpointsToAdd, TOP_LEVEL) ?? [];
    const addition = { generated: source.generated, endpoints: own, groups: outer };
    const content = sourceAfterAdd(addition, options, existingFiles, layout);
    if (content !== undefined) files.push(source.change(content, "modify"));
  }
  withInnerGroups(files, created, existingFiles, layout);
  /* Last, from every file as the other changes leave it. */
  if (barrel !== undefined) {
    const { existing, change } = barrel;
    const rebuilt = rebuildBarrel(layout, { ...existingFiles, ...contentsOf(files) });
    if (rebuilt !== undefined && rebuilt !== existing) files.push(change(rebuilt, "modify"));
  }

  return { files, newFingerprints };
}

/* A file changed once the others are: as it is, and how its change is written. */
interface Pending {
  existing: string;
  change: (content: string, action: "modify") => FileChange;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Find which endpoint names from `toAdd` go into a specific generated file */
function endpointsToAddForFile(
  filePath: string,
  endpointsToAdd: Record<string, string[]>,
  layout: ImportLayout,
): string[] {
  for (const [group, names] of Object.entries(endpointsToAdd)) {
    if (group !== TOP_LEVEL && filePath === layout.groupFile(group)) return names;
  }
  return [];
}

function extractSchemaNames(content: string): string[] {
  return [...exportedNames(parseSource("schemas.ts", content).program.body).keys()];
}

function contentsOf(files: readonly FileChange[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [file.path, file.content]));
}
