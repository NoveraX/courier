import type {
  Confirmation,
  FilePlan,
  KeptReason,
  Ownership,
  PlannedWrite,
} from "./file-plan-types";

/** A plan as the UI is shown it: what happens to each file, without the files' content. */
export interface PlanSummary {
  digest: string;
  dir: string;
  writes: Array<{ path: string; action: PlannedWrite["action"]; was: Ownership }>;
  removals: Array<{ path: string; was: Ownership }>;
  kept: Array<{ path: string; reason: KeptReason }>;
  pending: Confirmation[];
  blocked: FilePlan["blocked"];
  forgotten: string[];
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
  };
}
