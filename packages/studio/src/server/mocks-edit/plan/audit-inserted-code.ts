import { auditBindings } from "./audit-bindings";
import { auditMocksObject } from "./audit-object";
import { openAudit } from "./audit-scope";
import { auditStatements } from "./audit-statements";
import { rejectPlan } from "./reject-plan";
import { splitStatements } from "./split-statements";
import type { PlannedInsertion } from "./types";

/**
 * Check that the edited text says what the plan claims, read back the way
 * the planner reads a file: it parses cleanly; its top-level statements are
 * the old ones plus exactly the planned new ones; an import that gains names
 * gains exactly the planned ones; the mocks object declares its old keys and
 * then the planned ones; each new entry calls `defineMockServer` from the
 * mock package with exactly the planned fields; and every name the edit
 * imports was free.
 *
 * @param newText - The edited text
 * @param plan - What the plan claims
 * @throws {MocksEditRefusal} `INTERNAL_PLAN_REJECTED`, logged, when anything does not hold
 *
 * @example
 * ```ts
 * auditInsertedCode(draft.text, draft.audit); // throws only when the text says something else
 * ```
 */
export function auditInsertedCode(newText: string, plan: PlannedInsertion): void {
  const problem = findProblem(newText, plan);
  if (problem !== null) rejectPlan(plan, problem);
}

function findProblem(newText: string, plan: PlannedInsertion): string | null {
  const scope = openAudit(newText, plan);
  if (typeof scope === "string") return scope;
  const split = splitStatements(scope.next, plan);
  if (typeof split === "string") return split;
  return (
    auditStatements(scope, split) ?? auditMocksObject(scope, split) ?? auditBindings(scope, split)
  );
}
