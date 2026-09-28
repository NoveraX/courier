import type { ProjectRoot } from "../project-fs/project-root";
import { type ApplyReport, applyFilePlan } from "./apply-file-plan";
import { FilePlanError } from "./file-plan-error";
import type { FilePlan } from "./file-plan-types";
import { keepImported } from "./keep-imported";
import { summarizePlan } from "./plan-summary";
import { withConfirmations } from "./with-confirmations";

/**
 * Whether an apply must quote the plan it applies. `required` for changes
 * the user previews first — an update, managing endpoints, removing an
 * import; `when-shown` for a write, which quotes a plan once one was shown.
 */
export type PlanQuoting = "required" | "when-shown";

/** What the user saw and allowed of a plan. */
export interface PlanConsent {
  /** The digest of the plan the user was shown; absent when the user was shown none. */
  planDigest?: string;
  /** The paths whose pending step the user allowed. */
  confirm?: readonly string[];
}

/**
 * Apply a freshly made plan as the user allowed it. A plan that blocks is
 * refused; so is one that differs from the plan the user saw, one the
 * request does not quote where it must, and one with steps waiting for
 * consent when the user saw no plan. Each refusal carries the plan as it
 * stands, for the UI to show.
 *
 * @param root - The project
 * @param plan - The plan, made just now under the imports lock
 * @param consent - The digest the user saw, if any, and the steps the user allowed
 * @param commit - Records the applied plan with the apply's id; called once the files are in place
 * @param quoting - Whether the request must quote the plan
 * @returns What was written, removed and kept
 * @throws {FilePlanError} `TARGET_BLOCKED`, `PLAN_NOT_SEEN`, `PLAN_STALE`, `NEEDS_CONFIRMATION` or `CONFIRMATION_NOT_IN_PLAN`
 * @example
 * ```ts
 * runPlan(root, plan, consent, (applied, applyId) => save(applied, applyId), "required");
 * ```
 */
export function runPlan(
  root: ProjectRoot,
  plan: FilePlan,
  consent: PlanConsent,
  commit: (applied: FilePlan, applyId: string) => void,
  quoting: PlanQuoting,
): ApplyReport {
  const summary = summarizePlan(plan);
  if (plan.blocked.length > 0) {
    const paths = plan.blocked.map((b) => b.path);
    throw new FilePlanError(
      "TARGET_BLOCKED",
      `Studio will not write through a link or over a non-file: ${paths.join(", ")}.`,
      { paths },
      summary,
    );
  }
  if (consent.planDigest === undefined && quoting === "required") {
    throw new FilePlanError("PLAN_NOT_SEEN", "Look at the plan before applying it.", {}, summary);
  }
  if (consent.planDigest !== undefined && consent.planDigest !== plan.digest) {
    throw new FilePlanError(
      "PLAN_STALE",
      "The files changed since you saw the plan; look at it again.",
      {},
      summary,
    );
  }
  if (consent.planDigest === undefined && plan.pending.length > 0) {
    const paths = plan.pending.map((step) => step.confirmation.path);
    throw new FilePlanError(
      "NEEDS_CONFIRMATION",
      `Some files wait for your consent: ${paths.join(", ")}.`,
      { paths },
      summary,
    );
  }
  /* Whatever the user left unticked, no file that stays loses a file it imports. */
  const applied = keepImported(root, withConfirmations(plan, consent.confirm ?? []));
  return applyFilePlan(root, applied, (applyId) => commit(applied, applyId));
}
