import type { ApplyState, MockWizardState } from "./types";
import type { DeclareApplyResult } from "./wire-types";

import { withPreview } from "./with-preview";

function applyStateOf(
  result: Exclude<DeclareApplyResult, { status: "stale" | "invalid" | "manual" }>,
  at: number,
): ApplyState {
  return result.status === "applied" ? { ...result, at } : result;
}

/**
 * The wizard once Studio answered an apply of the ready plan it shows.
 * The mocks added end the wizard; a file changed since the preview shows the
 * new plan to confirm again; refused values go back to the drafts; a reason
 * to add them by hand shows as a preview's would; an edit that did not
 * check out is shown as it was left.
 *
 * @param state - The wizard, applying a ready plan
 * @param result - Studio's answer
 * @param at - When the answer arrived, in epoch milliseconds
 * @returns The wizard after the apply
 *
 * @example
 * ```ts
 * withApplyResult(state, { status: "applied", target: "courier.mocks.ts", keys: ["api"], warnings: [] }, Date.now()).step;
 * // → "done"
 * ```
 */
export function withApplyResult(
  state: MockWizardState,
  result: DeclareApplyResult,
  at: number,
): MockWizardState {
  const mocks = state.plan.status === "ready" ? state.plan.mocks : [];
  switch (result.status) {
    case "stale": {
      const next = withPreview(state, result.plan, mocks, null, at);
      return next.plan.status === "ready"
        ? { ...next, plan: { ...next.plan, changedOnDisk: true } }
        : next;
    }
    case "invalid":
    case "manual":
      return withPreview(state, result, mocks, null, at);
    case "applied":
      return { ...state, step: "done", apply: applyStateOf(result, at) };
    default:
      return { ...state, apply: applyStateOf(result, at) };
  }
}
