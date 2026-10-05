import type { MockWizardState } from "./types";

/** What the footer offers on the Review step. */
export type ReviewCta =
  /** Studio is planning or applying; nothing to click but Back. */
  | { kind: "wait"; label: string }
  /** Apply the ready plan, on an explicit click from `armedAt` on. */
  | { kind: "apply"; label: string; armedAt: number }
  /** Ask Studio for the plan again; never re-sends an apply. */
  | { kind: "checkAgain"; label: string }
  /** Nothing more the wizard can do. */
  | { kind: "close"; label: string };

function applyLabel(target: string, creates: boolean): string {
  return creates ? `Create ${target}` : `Add to ${target}`;
}

function afterApply(state: MockWizardState): ReviewCta | null {
  switch (state.apply.status) {
    case "applying":
      return { kind: "wait", label: "Adding…" };
    case "failed":
    case "rolledBack":
      return { kind: "checkAgain", label: "Check again" };
    case "notVerified":
    case "rollbackFailed":
      return { kind: "close", label: "Close" };
    default:
      return null;
  }
}

/**
 * The Review step's call to action. A ready plan is applied only by its
 * button, named after the file it changes or creates; a manual outcome
 * Studio says may pass on a second try ("retryable" — Studio still
 * loading, busy, or the mocks file changed since it loaded) offers to check
 * again, as do a failed request and an edit Studio took back.
 *
 * @param state - The wizard on its Review step
 * @returns What the footer offers
 *
 * @example
 * ```ts
 * reviewCta(stateWithManual({ retryable: true })); // → { kind: "checkAgain", label: "Check again" }
 * ```
 */
export function reviewCta(state: MockWizardState): ReviewCta {
  const applied = afterApply(state);
  if (applied) return applied;
  const { plan } = state;
  switch (plan.status) {
    case "ready":
      return {
        kind: "apply",
        label: applyLabel(plan.outcome.target, plan.outcome.creates),
        armedAt: plan.armedAt,
      };
    case "manual":
      return plan.outcome.retryable
        ? { kind: "checkAgain", label: "Check again" }
        : { kind: "close", label: "Close" };
    case "failed":
      return { kind: "checkAgain", label: "Try again" };
    default:
      return { kind: "wait", label: "Planning…" };
  }
}
