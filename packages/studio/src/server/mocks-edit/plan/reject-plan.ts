import { createLogger } from "@noverax/courier";
import { MocksEditRefusal } from "../mocks-edit-refusal";
import type { PlannedInsertion } from "./types";

const log = createLogger("Studio");

/**
 * Stop an edit whose plan failed Studio's own check. A plan that does not
 * hold up is a defect in Studio, not in the user's file, so it is logged
 * in full; the user is left the snippet to add by hand.
 *
 * @param plan - What the plan claimed
 * @param problem - What the check found
 * @throws {MocksEditRefusal} `INTERNAL_PLAN_REJECTED`, always
 *
 * @example
 * ```ts
 * rejectPlan(draft.audit, "the edited file does not parse");
 * // logs the defect and throws INTERNAL_PLAN_REJECTED
 * ```
 */
export function rejectPlan(plan: PlannedInsertion, problem: string): never {
  const keys = plan.entries.map((entry) => entry.key).join(", ");
  log.error(`The planned edit of ${plan.fileName} adding ${keys} failed its check: ${problem}`);
  throw new MocksEditRefusal(
    "INTERNAL_PLAN_REJECTED",
    `Studio could not verify its edit of ${plan.fileName} (${problem}), so it changed nothing.`,
  );
}
