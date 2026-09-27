import { StudioRequestError } from "@/lib/studio-request-error";

import type { FilePlanSummary } from "./types-file-plan";
import { readFilePlan } from "./read-file-plan";

const PLAN_CODES = ["NEEDS_CONFIRMATION", "PLAN_NOT_SEEN", "PLAN_STALE", "TARGET_BLOCKED"] as const;

/** Studio did not apply a file plan, and sent the plan as it stands. */
export interface PlanRefusal {
  /**
   * `NEEDS_CONFIRMATION`: the plan holds steps only the user may allow.
   * `PLAN_NOT_SEEN`: the request quoted no plan where one must be seen first.
   * `PLAN_STALE`: the files changed since the user saw the plan.
   * `TARGET_BLOCKED`: a file the plan writes is a link or not a file.
   */
  code: (typeof PLAN_CODES)[number];
  /** Studio's explanation. */
  message: string;
  plan: FilePlanSummary;
}

/**
 * Read a refused file plan from a failed request: nothing was written, and
 * the plan as it stands comes back for the user to look at and allow.
 *
 * @param error - What the request threw
 * @returns The refusal, or `null` when the request failed some other way
 * @example
 * ```ts
 * const refusal = readPlanRefusal(error);
 * if (refusal?.code === "NEEDS_CONFIRMATION") askAbout(refusal.plan.pending);
 * ```
 */
export function readPlanRefusal(error: unknown): PlanRefusal | null {
  if (!(error instanceof StudioRequestError)) return null;
  const code = PLAN_CODES.find((known) => known === error.code);
  const plan = readFilePlan(error.data.plan);
  return code && plan ? { code, message: error.message, plan } : null;
}
