import type { ParsedSpec } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { type ImportLayout, resolveImportLayout } from "../apis/layout";
import { previewAddEndpoints, previewRemoveEndpoints } from "../apis/manage";
import { FLAT_GROUP, isFlatImport, specSelection } from "../apis/manage/flat-import";
import { previewRemoveFlatEndpoints } from "../apis/manage/remove-flat-endpoints";
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
  const flat = isFlatImport(declared);
  /* A flat import's one group is picked from as a whole; the generator selects by the spec's groups. */
  const toAdd = flat ? specSelection(body.spec, body.toAdd[FLAT_GROUP] ?? []) : body.toAdd;
  const addResult =
    Object.keys(toAdd).length > 0
      ? previewAddEndpoints(
          body.spec,
          toAdd,
          { ...declared, selectedEndpoints: toAdd },
          onDisk,
          layout,
        )
      : undefined;
  const afterAdd = { ...onDisk, ...contentsOf(addResult) };
  const fingerprints = manageFingerprints(entry, onDisk);
  const removeResult = !Object.values(body.toRemove).some((names) => names.length > 0)
    ? undefined
    : flat
      ? previewRemoveFlatEndpoints(body.toRemove[FLAT_GROUP] ?? [], afterAdd, fingerprints, layout)
      : previewRemoveEndpoints(body.toRemove, afterAdd, fingerprints, layout);
  const fileOf = (group: string): string => (flat ? layout.sourceFile : layout.groupFile(group));
  const request = managePlanRequest(layout, body.toRemove, addResult, removeResult, entry, fileOf);
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
