/**
 * Helpers for update flow routes — preview and apply logic.
 */

import type { LoadedForRoutes, ProjectRoot } from "@noverax/courier-cli/devkit";
import type { ParsedSpec } from "../apis";
import { createSpecDigest, diffSpecs } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { resolveImportLayout } from "../apis/layout";
import type { BreakingChange, SpecDiff } from "../apis/merge/types";
import { checkDirOverlap } from "./check-dir-overlap";
import { checkFormerFolder } from "./check-former-folder";
import type { ApplyReport } from "./import-files/apply-file-plan";
import type { PlanSummary } from "./import-files/plan-summary";
import { previewSummary } from "./import-files/preview-summary";
import type { PlanConsent } from "./import-files/run-plan";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import { applyRegeneration, planRegeneration, type Regeneration } from "./regenerate-import";
import { withRoutesModule } from "./routes-module/with-routes-module";
import { declaredSpec } from "./spec-as-declared";

interface UpdateRequest {
  name: string;
  newSpec: ParsedSpec;
}

/** What regenerating an import from a new spec would do. */
export interface UpdatePreview {
  plan: PlanSummary;
  leftBehind: string[];
  breakingChanges: BreakingChange[];
  specDiff?: SpecDiff;
}

/** What regenerating an import from a new spec did. */
export interface UpdateApplied
  extends Pick<ApplyReport, "written" | "removed" | "kept" | "backupDir" | "pruneFailures"> {
  leftBehind: string[];
}

type Refusal = { error: string; status: number };

/**
 * Plan regenerating a declared import from a new spec, with the declaration's
 * options: which files change, merge, go or wait for consent, and how the
 * API itself changes.
 *
 * @param body - The import's name, and the new spec
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @param root - The project
 * @param running - The config Studio runs, which says where the routes module is
 * @returns The plan and the spec's changes, or the error to answer with and its status
 * @throws {SpecPinMismatchError} When the import pins another spec
 * @throws {ImportRenamedError} When the import's files are still where Studio 0.3.0 bound it otherwise
 * @throws {ImportTransformError} When the import's transform fails
 */
export async function handlePreviewUpdate(
  body: UpdateRequest,
  imports: ImportsSnapshot,
  root: ProjectRoot,
  running: LoadedForRoutes | null = null,
): Promise<UpdatePreview | Refusal> {
  const regeneration = await regenerationOf(body, imports, root, running);
  if ("error" in regeneration) return regeneration;
  const { plan, leftBehind } = await planRegeneration(regeneration);
  const specDiff = computeSpecDiff(regeneration.entry, regeneration.spec);
  return {
    plan: previewSummary(root, plan),
    leftBehind,
    breakingChanges: specDiff?.breakingChanges ?? [],
    ...(specDiff !== undefined && { specDiff }),
  };
}

/**
 * Regenerate a declared import from a new spec, as previewed: the plan is
 * made again and applied only if it is the one the user saw.
 *
 * @param body - The import's name, the new spec, and the plan the user saw and allowed
 * @param imports - The declarations of the config Studio runs, with the imports state
 * @param root - The project
 * @param running - The config Studio runs, which says where the routes module is
 * @returns What was written, removed and kept, or the error to answer with and its status
 * @throws {FilePlanError} When the plan is refused as it stands
 * @throws {SpecPinMismatchError} When the import pins another spec
 * @throws {ImportRenamedError} When the import's files are still where Studio 0.3.0 bound it otherwise
 * @throws {ImportTransformError} When the import's transform fails
 */
export async function handleApplyUpdate(
  body: UpdateRequest & PlanConsent,
  imports: ImportsSnapshot,
  root: ProjectRoot,
  running: LoadedForRoutes | null = null,
): Promise<UpdateApplied | Refusal> {
  const regeneration = await regenerationOf(body, imports, root, running);
  if ("error" in regeneration) return regeneration;
  const { report, leftBehind } = await applyRegeneration(regeneration, body, "required");
  const { written, removed, kept, backupDir, pruneFailures } = report;
  return { written, removed, kept, backupDir, pruneFailures, leftBehind };
}

/* Generated as declared: from the spec the declaration makes of the new one, with its options. */
async function regenerationOf(
  body: UpdateRequest,
  imports: ImportsSnapshot,
  root: ProjectRoot,
  running: LoadedForRoutes | null,
): Promise<Regeneration | Refusal> {
  const entry = getImportEntry(imports, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const layout = resolveImportLayout(entry, body.name);
  const state = getImportState(imports, body.name);
  checkDirOverlap(body.name, layout.dir, imports);
  checkFormerFolder(root, body.name, entry, layout, state);
  return {
    root,
    name: body.name,
    layout,
    ...(await declaredSpec(entry, body.name, body.newSpec)),
    options: { ...withRoutesModule(entry, running), selectedEndpoints: null },
    entry: state,
  };
}

function computeSpecDiff(
  state: ImportStateEntry | undefined,
  newSpec: ParsedSpec,
): SpecDiff | undefined {
  const oldDigest = state?.digest;
  return oldDigest ? diffSpecs(oldDigest, createSpecDigest(newSpec)) : undefined;
}
