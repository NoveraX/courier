import { CourierError } from "@noverax/courier";
import type { PlanSummary } from "./plan-summary";

/** Why Studio will not apply an import's file plan as asked. */
export type FilePlanErrorCode =
  | "NEEDS_CONFIRMATION"
  | "PLAN_NOT_SEEN"
  | "PLAN_STALE"
  | "TARGET_BLOCKED"
  | "CONFIRMATION_NOT_IN_PLAN";

const HTTP_STATUS: Readonly<Record<FilePlanErrorCode, 409 | 400>> = {
  NEEDS_CONFIRMATION: 409,
  PLAN_NOT_SEEN: 409,
  PLAN_STALE: 409,
  TARGET_BLOCKED: 409,
  CONFIRMATION_NOT_IN_PLAN: 400,
};

/**
 * An import's file plan cannot be applied as asked: it holds steps only the
 * user may allow, the request quotes no plan where one must be seen first,
 * the files changed since the user saw it, a file it would write is a link
 * or not a file, or the request allows a step the plan does not hold.
 * Nothing was written.
 *
 * @example
 * ```ts
 * throw new FilePlanError("PLAN_STALE", "The files changed since the preview; look at it again.");
 * ```
 */
export class FilePlanError extends CourierError<FilePlanErrorCode> {
  /** 409 when the plan or the project has to change first; 400 for a request that cannot be right. */
  readonly httpStatus: 409 | 400;
  /** The plan as it stands now, for the UI to show, when there is one to show. */
  readonly plan: PlanSummary | undefined;

  /**
   * @param code - Why the plan is not applied
   * @param message - What is wrong, and what to do
   * @param context - The paths or digests involved
   * @param plan - The plan as it stands now
   */
  constructor(
    code: FilePlanErrorCode,
    message: string,
    context: Record<string, unknown> = {},
    plan?: PlanSummary,
  ) {
    super(message, { code, context });
    this.httpStatus = HTTP_STATUS[code];
    this.plan = plan;
  }
}
