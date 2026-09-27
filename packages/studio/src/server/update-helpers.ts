/**
 * Helpers for update flow routes — preview and apply logic.
 */

import type { ParsedSpec } from "../apis";
import { createSpecDigest, diffSpecs } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import { resolveImportLayout } from "../apis/layout";
import type { BreakingChange, SpecDiff } from "../apis/merge/types";
import { checkDirOverlap } from "./check-dir-overlap";
import type { ApplyReport } from "./import-files/apply-file-plan";
import { type PlanSummary, summarizePlan } from "./import-files/plan-summary";
import type { PlanConsent } from "./import-files/run-plan";
import { getImportEntry, getImportState, type ImportsSnapshot } from "./imports-bridge";
import type { ProjectRoot } from "./project-fs/project-root";
import { applyRegeneration, planRegeneration, type Regeneration } from "./regenerate-import";

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
 * @returns The plan and the spec's changes, or the error to answer with and its status
 */
export function handlePreviewUpdate(
  body: UpdateRequest,
  imports: ImportsSnapshot,
  root: ProjectRoot,
): UpdatePreview | Refusal {
  const regeneration = regenerationOf(body, imports, root);
  if ("error" in regeneration) return regeneration;
  const { plan, leftBehind } = planRegeneration(regeneration);
  const specDiff = computeSpecDiff(regeneration.entry, body.newSpec);
  return {
    plan: summarizePlan(plan),
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
 * @returns What was written, removed and kept, or the error to answer with and its status
 * @throws {FilePlanError} When the plan is refused as it stands
 */
export function handleApplyUpdate(
  body: UpdateRequest & PlanConsent,
  imports: ImportsSnapshot,
  root: ProjectRoot,
): UpdateApplied | Refusal {
  const regeneration = regenerationOf(body, imports, root);
  if ("error" in regeneration) return regeneration;
  const { report, leftBehind } = applyRegeneration(regeneration, body, "required");
  const { written, removed, kept, backupDir, pruneFailures } = report;
  return { written, removed, kept, backupDir, pruneFailures, leftBehind };
}

function regenerationOf(
  body: UpdateRequest,
  imports: ImportsSnapshot,
  root: ProjectRoot,
): Regeneration | Refusal {
  const entry = getImportEntry(imports, body.name);
  if (!entry) return { error: `Source "${body.name}" not found`, status: 404 };
  const layout = resolveImportLayout(entry, body.name);
  checkDirOverlap(body.name, layout.dir, imports);
  return {
    root,
    name: body.name,
    layout,
    spec: body.newSpec,
    options: { ...entry, selectedEndpoints: null },
    entry: getImportState(imports, body.name),
  };
}

function computeSpecDiff(
  state: ImportStateEntry | undefined,
  newSpec: ParsedSpec,
): SpecDiff | undefined {
  const oldDigest = state?.digest;
  return oldDigest ? diffSpecs(oldDigest, createSpecDigest(newSpec)) : undefined;
}
