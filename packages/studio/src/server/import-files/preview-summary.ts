import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import type { FilePlan } from "./file-plan-types";
import { keepImported } from "./keep-imported";
import { type PlanSummary, summarizePlan } from "./plan-summary";
import { withConfirmations } from "./with-confirmations";

/**
 * A plan as the UI is shown it before it is applied: a file the plan would
 * remove that a file staying imports is shown kept, as the apply keeps it,
 * so the preview promises no removal the apply then skips. A removal that
 * waits for consent is shown waiting; a file kept only because a file a
 * step waiting for consent would remove or rewrite imports it is shown
 * kept `unless` the user allows those steps — the apply, which weighs the
 * consent once given, removes it then — so the UI can show where it goes
 * as the user ticks them.
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
  const declined = keepImported(root, plan);
  const summary = summarizePlan(declined);
  const unless = keptUnless(root, plan, declined);
  if (unless.size === 0) return summary;
  return {
    ...summary,
    kept: summary.kept.map((entry) => {
      const steps = unless.get(entry.path);
      return steps === undefined ? entry : { ...entry, unless: steps };
    }),
  };
}

/* Each file kept as imported that goes once every waiting step is allowed, with the steps that,
   each declined alone, keep it: it goes when all of them are allowed. */
function keptUnless(root: ProjectRoot, plan: FilePlan, declined: FilePlan): Map<string, string[]> {
  const waiting = plan.pending.map((step) => step.confirmation.path);
  const imported = declined.kept.filter((entry) => entry.reason === "imported");
  const found = new Map<string, string[]>();
  if (waiting.length === 0 || imported.length === 0) return found;
  const keptWith = (allowed: readonly string[]): Set<string> =>
    new Set(
      keepImported(root, withConfirmations(plan, allowed))
        .kept.filter((entry) => entry.reason === "imported")
        .map((entry) => entry.path),
    );
  const everyAllowed = keptWith(waiting);
  const eachDeclined = waiting.map((path) => ({
    path,
    kept: keptWith(waiting.filter((other) => other !== path)),
  }));
  for (const { path } of imported) {
    if (everyAllowed.has(path)) continue;
    const steps = eachDeclined.filter((step) => step.kept.has(path)).map((step) => step.path);
    if (steps.length > 0) found.set(path, steps);
  }
  return found;
}
