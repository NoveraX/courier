import type {
  Confirmation,
  FilePlan,
  KeptReason,
  Ownership,
  PlanFormatting,
  PlannedWrite,
} from "./file-plan-types";

/** A plan as the UI is shown it: what happens to each file, without the files' content. */
export interface PlanSummary {
  digest: string;
  dir: string;
  writes: Array<{ path: string; action: PlannedWrite["action"]; was: Ownership }>;
  removals: Array<{ path: string; was: Ownership }>;
  /**
   * Each file left as it is, and why. One a file imports that a step waiting
   * for consent would remove or rewrite lists those steps as `unless`: it
   * goes once all of them are allowed.
   */
  kept: Array<{ path: string; reason: KeptReason; unless?: string[] }>;
  pending: Confirmation[];
  blocked: FilePlan["blocked"];
  forgotten: string[];
  /** How the files were formatted, when the plan was made to format them. */
  formatting?: PlanFormatting;
}

/**
 * Describe a plan for the UI: every file it writes, removes, keeps, holds
 * for consent or cannot write, and the digest an apply must quote.
 *
 * @param plan - The plan
 * @returns Its summary
 * @example
 * ```ts
 * res.json({ plan: summarizePlan(plan) });
 * ```
 */
export function summarizePlan(plan: FilePlan): PlanSummary {
  return {
    digest: plan.digest,
    dir: plan.dir,
    writes: plan.writes.map(({ path, action, was }) => ({ path, action, was })),
    removals: plan.removals.map(({ path, was }) => ({ path, was })),
    kept: plan.kept,
    pending: plan.pending.map((step) => step.confirmation),
    blocked: plan.blocked,
    forgotten: plan.forgotten,
    ...(plan.formatting && { formatting: plan.formatting }),
  };
}
