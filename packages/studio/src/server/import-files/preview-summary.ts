import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import type { FilePlan } from "./file-plan-types";
import { keepImported } from "./keep-imported";
import { type PlanSummary, summarizePlan } from "./plan-summary";

/**
 * A plan as the UI is shown it before it is applied: a file the plan would
 * remove that a file staying imports is shown kept, as the apply keeps it,
 * so the preview promises no removal the apply then skips. A removal that
 * waits for consent is shown waiting; the apply weighs it once given.
 *
 * @param root - The project
 * @param plan - The plan
 * @returns What the UI is shown of it
 * @example
 * ```ts
 * res.json({ plan: previewSummary(root, plan) });
 * ```
 */
export function previewSummary(root: ProjectRoot, plan: FilePlan): PlanSummary {
  return summarizePlan(keepImported(root, plan));
}
