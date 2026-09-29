import { fieldErrorsOf } from "./field-errors-of";
import type { MockWizardState, PlanState } from "./types";
import { UNPLANNED } from "./unplanned";
import type { DeclarePreview, FieldError, MockDeclaration } from "./wire-types";

/* Long enough to outlast a double click's second click, short enough not to be waited for. */
const APPLY_ARM_DELAY_MS = 500;

/* Studio refused the values: back to the drafts, with each error on its field. */
function withFieldErrors(state: MockWizardState, errors: readonly FieldError[]): MockWizardState {
  const { byDraft, unplaced } = fieldErrorsOf(errors, state.drafts);
  return {
    ...state,
    ...UNPLANNED,
    step: "configure",
    serverErrors: byDraft,
    requestProblems: unplaced,
  };
}

function planOf(
  outcome: Exclude<DeclarePreview, { status: "invalid" }>,
  mocks: MockDeclaration[],
  previousDigest: string | null,
  at: number,
): PlanState {
  if (outcome.status === "manual") return { status: "manual", outcome };
  const changedOnDisk = previousDigest !== null && previousDigest !== outcome.planDigest;
  return { status: "ready", outcome, mocks, changedOnDisk, armedAt: at + APPLY_ARM_DELAY_MS };
}

/**
 * The wizard once Studio answered a preview for `mocks`.
 *
 * @param state - The wizard, waiting for the answer
 * @param outcome - Studio's answer
 * @param mocks - The declarations the answer is for
 * @param previousDigest - The digest of a plan shown before, which a new one differs from when the project changed
 * @param at - When the answer arrived, in epoch milliseconds; a ready plan can be applied a moment after it
 * @returns The wizard showing the plan, or back on the drafts with Studio's errors
 *
 * @example
 * ```ts
 * withPreview(state, { status: "invalid", errors }, mocks, null, Date.now()).step; // → "configure"
 * ```
 */
export function withPreview(
  state: MockWizardState,
  outcome: DeclarePreview,
  mocks: MockDeclaration[],
  previousDigest: string | null,
  at: number,
): MockWizardState {
  if (outcome.status === "invalid") return withFieldErrors(state, outcome.errors);
  const plan = planOf(outcome, mocks, previousDigest, at);
  return { ...state, step: "review", plan, apply: { status: "idle" } };
}
