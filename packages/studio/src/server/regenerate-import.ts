import { CourierError } from "@noverax/courier";
import type { GenerateOptions, ParsedSpec } from "../apis";
import { createSpecDigest, generateCode } from "../apis";
import type { ImportStateEntry } from "../apis/imports-state";
import type { ImportLayout } from "../apis/layout";
import { generatedImportExtension } from "./generated-import-extension";
import type { ApplyReport } from "./import-files/apply-file-plan";
import type { FilePlan } from "./import-files/file-plan-types";
import { planFiles } from "./import-files/plan-files";
import { recordAfterApply } from "./import-files/record-after-apply";
import { regenerationRequest } from "./import-files/regeneration-request";
import { type PlanConsent, type PlanQuoting, runPlan } from "./import-files/run-plan";
import { saveImportEntry } from "./import-files/save-import-entry";
import type { ProjectRoot } from "./project-fs/project-root";
import { SpecGenerationError } from "./spec-generation-error";

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
}

/**
 * Plan generating an import afresh: its files as the spec gives them now,
 * merged with the user's edits to endpoints, and the files it had that the
 * spec no longer gives.
 *
 * @param regeneration - The import, where it goes, the spec and options, and its record
 * @returns The plan, and the recorded files left outside the import's directory
 * @throws {SpecGenerationError} When the spec cannot be generated from
 */
export function planRegeneration(regeneration: Regeneration): {
  plan: FilePlan;
  leftBehind: string[];
} {
  const { root, name, layout, spec, options, entry } = regeneration;
  const importExtension = generatedImportExtension(root.path, layout);
  const generated = generate(
    spec,
    { ...options, ...(importExtension && { importExtension }) },
    name,
  );
  const { request, leftBehind } = regenerationRequest(root, layout, generated, entry);
  return { plan: planFiles(root, request, entry?.files ?? {}), leftBehind };
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
  const { plan, leftBehind } = planRegeneration(regeneration);
  const { root, name, spec, specHash, entry } = regeneration;
  const applied = { specHash, digest: createSpecDigest(spec) };
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

function generate(
  spec: ParsedSpec,
  options: GenerateOptions,
  name: string,
): ReturnType<typeof generateCode> {
  try {
    return generateCode(spec, options, name);
  } catch (error) {
    if (error instanceof CourierError) throw error;
    throw new SpecGenerationError(error);
  }
}
