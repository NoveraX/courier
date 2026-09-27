import { FilePlanError } from "./file-plan-error";
import type { FilePlan } from "./file-plan-types";

/**
 * Take the steps the user allowed into a plan: a confirmed pending write or
 * removal joins the others, and one left unconfirmed is kept as it is. The
 * digest stays that of the plan the user was shown.
 *
 * @param plan - The plan as previewed
 * @param confirmed - The paths the user allowed a pending step for
 * @returns The plan to apply, with nothing pending
 * @throws {FilePlanError} `CONFIRMATION_NOT_IN_PLAN` for a path the plan holds no pending step for
 * @example
 * ```ts
 * const toApply = withConfirmations(plan, body.confirm ?? []);
 * ```
 */
export function withConfirmations(plan: FilePlan, confirmed: readonly string[]): FilePlan {
  const pendingPaths = new Set(plan.pending.map((step) => step.confirmation.path));
  const unknown = confirmed.filter((path) => !pendingPaths.has(path));
  if (unknown.length > 0) {
    throw new FilePlanError(
      "CONFIRMATION_NOT_IN_PLAN",
      `Nothing in the plan waits for consent to ${unknown.join(", ")}.`,
      { paths: unknown },
    );
  }
  const allowed = new Set(confirmed);
  const next: FilePlan = {
    ...plan,
    writes: [...plan.writes],
    removals: [...plan.removals],
    kept: [...plan.kept],
    pending: [],
  };
  for (const step of plan.pending) {
    const { path } = step.confirmation;
    if (!allowed.has(path)) next.kept.push({ path, reason: "unconfirmed" });
    else if (step.write) next.writes.push(step.write);
    else if (step.removal) next.removals.push(step.removal);
  }
  return next;
}
