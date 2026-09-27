import type { ParsedSpec } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { type ImportLayout, resolveImportLayout } from "../apis/layout";
import { previewAddEndpoints, previewRemoveEndpoints } from "../apis/manage";
import type { AddResult, RemoveResult } from "../apis/manage/types";
import { checkDirOverlap } from "./check-dir-overlap";
import type { FilePlan } from "./import-files/file-plan-types";
import { importBodies } from "./import-files/import-bodies";
import { planFiles } from "./import-files/plan-files";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import { manageFingerprints } from "./manage-fingerprints";
import { managePlanRequest } from "./manage-plan-request";
import type { ProjectRoot } from "./project-fs/project-root";

/** The endpoints to add and remove of an import, by group. */
export interface ManageRequest {
  name: string;
  spec: ParsedSpec;
  toAdd: Record<string, string[]>;
  toRemove: Record<string, string[]>;
}

/** What adding and removing endpoints produces, and the plan that writes it. */
export interface ManagePlan {
  addResult?: AddResult;
  removeResult?: RemoveResult;
  plan: FilePlan;
  entry: ImportStateEntry | undefined;
  layout: ImportLayout;
}

/**
 * Work out adding and removing endpoints of a declared import, from its
 * files on disk: endpoints are added first and removed from the result, so
 * a file both change carries both. The plan says what is written, removed
 * and kept, and what waits for the user.
 *
 * @param body - The import, its spec, and the endpoints to add and remove by group
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @param root - The project
 * @returns The changes and their plan, or the error to answer with and its status
 * @throws {DirOverlapError} When another import owns a directory overlapping the import's
 */
export function planManage(
  body: ManageRequest,
  imports: ImportsSnapshot,
  root: ProjectRoot,
): ManagePlan | { error: string; status: number } {
  const declared = getImportEntry(imports, body.name);
  if (!declared) return { error: `Source "${body.name}" not found`, status: 404 };
  const entry = getImportState(imports, body.name);
  const layout = resolveImportLayout(declared, body.name);
  checkDirOverlap(body.name, layout.dir, imports);
  const onDisk = importBodies(root, layout.dir);
  const adding = Object.keys(body.toAdd).length > 0;
  const addResult = adding
    ? previewAddEndpoints(
        body.spec,
        body.toAdd,
        { ...declared, selectedEndpoints: body.toAdd },
        onDisk,
        layout,
      )
    : undefined;
  const afterAdd = { ...onDisk, ...contentsOf(addResult) };
  const removeResult =
    Object.keys(body.toRemove).length > 0
      ? previewRemoveEndpoints(body.toRemove, afterAdd, manageFingerprints(entry, onDisk), layout)
      : undefined;
  const request = managePlanRequest(layout, body.toRemove, addResult, removeResult, entry);
  return {
    ...(addResult && { addResult }),
    ...(removeResult && { removeResult }),
    plan: planFiles(root, request, entry?.files ?? {}),
    entry,
    layout,
  };
}

function contentsOf(added: AddResult | undefined): Record<string, string> {
  if (!added) return {};
  const files = added.files.map((file) => [file.path, file.content] as const);
  const source = added.sourceFileUpdate
    ? [[added.sourceFileUpdate.path, added.sourceFileUpdate.content] as const]
    : [];
  return Object.fromEntries([...files, ...source]);
}
