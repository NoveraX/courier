/**
 * Requests that change an import's files. Studio plans each change by who
 * owns every file, applies a plan only as the user saw and allowed it, and
 * answers a plan it will not apply unasked with 409 and the plan.
 */

import type {
  GenerateOptions,
  ManagePreviewResult,
  ParsedSpec,
  SpecDiff,
} from "@/features/apis/types";
import type { FilePlanSummary, KeptReason } from "@/features/apis/types-file-plan";
import { post } from "@/lib/api-client";

/** The plan a request applies, as the user saw it, and the pending steps they allowed. */
/** An import as the wizard sends it: the spec, where it came from, and the options. */
export interface ImportBody {
  sourceName: string;
  spec: ParsedSpec;
  specUrl: string;
  importType: string;
  options: GenerateOptions;
}

export interface PlanQuote {
  planDigest?: string;
  confirm?: string[];
}

/** What applying an import's file plan did. */
export interface AppliedFiles {
  /** Project-relative files written. */
  written: string[];
  /** Project-relative files removed. */
  removed: string[];
  /** Files left as they were, and why. */
  kept: Array<{ path: string; reason: KeptReason }>;
  /** Where the replaced and removed files were copied, relative to the project; absent when there were none. */
  backupDir?: string;
  /** Folders the apply emptied that Studio could not remove, and why. */
  pruneFailures: Array<{ path: string; code: string }>;
}

/** What courier.config still says about an import whose files go. */
export interface RemovalConfigNotes {
  /** The config Studio runs, relative to the project; absent while none runs. */
  configFile?: string;
  /** Whether it still declares the import under `imports`. */
  importDeclared: boolean;
  /** Files the removal may take away that the config imports; the config stops loading once they are gone. */
  configImports: string[];
}

// ── Write ───────────────────────────────────────────────────────────────────

/**
 * Ask Studio to write an import's files. Studio generates them itself from
 * the spec and the options; when the plan holds steps only the user may
 * allow, it answers 409 with the plan, and the request is sent again quoting
 * it.
 *
 * @param payload - The import, its spec and options, and the plan quoted once one was shown
 * @returns Studio's answer: what it wrote, and what courier.config must still declare
 * @throws {StudioRequestError} `NEEDS_CONFIRMATION`, `PLAN_STALE` or `TARGET_BLOCKED` with the plan, and nothing written
 */
export function writeFiles(payload: ImportBody & PlanQuote): Promise<unknown> {
  return post("/api/apis/write", payload);
}

// ── Remove ──────────────────────────────────────────────────────────────────

/**
 * Plan removing an import: which files go, which wait for the user and
 * which stay, and what courier.config still says about it.
 *
 * @param name - The import
 * @returns The plan and the notes
 */
export function previewRemoval(
  name: string,
): Promise<{ plan: FilePlanSummary } & RemovalConfigNotes> {
  return post("/api/apis/imports/remove/preview", { name });
}

/**
 * Remove an import's files as previewed, and forget the import.
 *
 * @param name - The import
 * @param quote - The plan the user saw, and the steps they allowed
 * @returns What was removed and kept, and where the copies are
 * @throws {StudioRequestError} `PLAN_STALE` with the plan when the files changed since the preview
 */
export function removeImport(
  name: string,
  quote: PlanQuote,
): Promise<AppliedFiles & RemovalConfigNotes> {
  return post("/api/apis/imports/remove", { name, ...quote });
}

// ── Update ──────────────────────────────────────────────────────────────────

/**
 * Plan regenerating an import from a new specification.
 *
 * @param payload - The import and the new specification
 * @returns The plan, the files left in a previous folder, and what changed in the specification
 */
export function previewUpdate(payload: { name: string; newSpec: ParsedSpec }): Promise<{
  plan: FilePlanSummary;
  /** Files written before the import's directory moved, left where they are. */
  leftBehind: string[];
  breakingChanges: unknown[];
  specDiff?: SpecDiff;
}> {
  return post("/api/apis/update/preview", payload);
}

// ── Manage ───────────────────────────────────────────────────────────────────

/**
 * Plan adding and removing endpoints of an import.
 *
 * @param name - The import
 * @param spec - Its specification
 * @param toAdd - The endpoints to add, by group
 * @param toRemove - The endpoints to remove, by group
 * @returns What adding and removing produce, and the plan for the import's files
 */
export function previewManage(
  name: string,
  spec: ParsedSpec,
  toAdd: Record<string, string[]>,
  toRemove: Record<string, string[]>,
): Promise<ManagePreviewResult> {
  return post("/api/apis/manage/preview", { name, spec, toAdd, toRemove });
}

/**
 * Add and remove endpoints of an import as previewed.
 *
 * @param name - The import
 * @param spec - Its specification
 * @param toAdd - The endpoints to add, by group
 * @param toRemove - The endpoints to remove, by group
 * @param quote - The plan the user saw, and the steps they allowed
 * @returns What was written, removed and kept, and where the copies are
 * @throws {StudioRequestError} `PLAN_NOT_SEEN` without a quoted plan, `PLAN_STALE` when the files changed
 */
export function applyManage(
  name: string,
  spec: ParsedSpec,
  toAdd: Record<string, string[]>,
  toRemove: Record<string, string[]>,
  quote: PlanQuote,
): Promise<AppliedFiles> {
  return post("/api/apis/manage/apply", { name, spec, toAdd, toRemove, ...quote });
}
