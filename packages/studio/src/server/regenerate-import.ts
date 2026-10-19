import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import { findFormatters, formatProjectFiles } from "@noverax/courier-cli/devkit";
import type { GenerateOptions, ParsedSpec } from "../apis";
import { createSpecDigest, generateCode } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import type { ImportLayout } from "../apis/layout";
import { renamedGroupFiles } from "../apis/manage/renamed-group-files";
import { generatedFromSpec } from "./generated-from-spec";
import { generatedImportExtension } from "./generated-import-extension";
import type { ApplyReport } from "./import-files/apply-file-plan";
import type { FilePlan } from "./import-files/file-plan-types";
import { importBodies } from "./import-files/import-bodies";
import { planFiles } from "./import-files/plan-files";
import { recordAfterApply } from "./import-files/record-after-apply";
import { regenerationRequest } from "./import-files/regeneration-request";
import { type PlanConsent, type PlanQuoting, runPlan } from "./import-files/run-plan";
import { saveImportEntry } from "./import-files/save-import-entry";
import { formatPlannedWrites } from "./project-format/format-planned-writes";

/** An import to generate afresh from a spec. */
export interface Regeneration {
  root: ProjectRoot;
  name: string;
  layout: ImportLayout;
  /** The specification the files are generated from. */
  spec: ParsedSpec;
  /** The hash of the specification as sent, before any transform or selection: what an update check compares. */
  specHash: string;
  options: GenerateOptions;
  /** What Studio recorded about the import, if anything. */
  entry: ImportStateEntry | undefined;
  /** Where the specification came from; the import's own when left out. */
  origin?: "traffic" | "given" | undefined;
}

/**
 * Plan generating an import afresh: its files as the spec gives them now,
 * merged with the user's edits to endpoints — a group named otherwise than
 * its files are, with the file it was written to — and the files it had
 * that the spec no longer gives. The files are formatted as the project formats its
 * code before anything reads them, so the endpoints' fingerprints, the plan
 * shown and the files written are of the same text.
 *
 * @param regeneration - The import, where it goes, the spec and options, and its record
 * @returns The plan, and the recorded files left outside the import's directory
 * @throws {InvalidSpecError} When a value the spec gives that would be written as code is refused
 * @throws {SpecGenerationError} When the spec cannot be generated from
 */
export async function planRegeneration(
  regeneration: Regeneration,
): Promise<{ plan: FilePlan; leftBehind: string[] }> {
  const { root, name, layout, spec, options, entry } = regeneration;
  const importExtension = generatedImportExtension(root.path, layout);
  const formatters = findFormatters(root.path);
  const generated = await formatProjectFiles(
    root.path,
    generatedFromSpec(() =>
      generateCode(spec, { ...options, ...(importExtension && { importExtension }) }, name),
    ),
    formatters,
  );
  /* A group Studio now names otherwise is written from the file its group was in. */
  const moved = renamedGroupFiles(spec, options.groupBy, layout, importBodies(root, layout.dir));
  const { request, leftBehind } = regenerationRequest(root, layout, generated.files, entry, moved);
  const planned = planFiles(root, request, entry?.files ?? {});
  return { plan: await formatPlannedWrites(root.path, planned, formatters, generated), leftBehind };
}

/**
 * Generate an import afresh and apply the plan as the user allowed it,
 * recording the spec it came from and every file written.
 *
 * @param regeneration - The import, where it goes, the spec and options, and its record
 * @param consent - The plan the user saw, if any, and the steps the user allowed
 * @param quoting - Whether the request must quote the plan: an update previews it first, a write need not
 * @returns What was written, removed and kept, and the recorded files left behind
 * @throws {SpecGenerationError} When the spec cannot be generated from
 * @throws {FilePlanError} When the plan is refused as it stands
 */
export async function applyRegeneration(
  regeneration: Regeneration,
  consent: PlanConsent,
  quoting: PlanQuoting,
): Promise<{ report: ApplyReport; leftBehind: string[] }> {
  const { plan, leftBehind } = await planRegeneration(regeneration);
  const { root, name, spec, specHash, entry, origin } = regeneration;
  const applied = { specHash, digest: createSpecDigest(spec), ...(origin && { origin }) };
  const now = new Date().toISOString();
  const report = await runPlan(
    root,
    plan,
    consent,
    (confirmed, applyId) =>
      saveImportEntry(root.path, name, recordAfterApply(entry, confirmed, applied, now), applyId),
    quoting,
  );
  return { report, leftBehind };
}
