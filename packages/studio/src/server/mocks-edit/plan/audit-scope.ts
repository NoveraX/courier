import type { ParsedSource } from "@noverax/courier-cli/devkit";
import { parseSource } from "@noverax/courier-cli/devkit";
import { MocksEditRefusal } from "../mocks-edit-refusal";
import { describeProblem } from "./describe-problem";
import type { LocatedMocks } from "./locate-mocks-object";
import { locateMocksObject } from "./locate-mocks-object";
import type { MockImports } from "./read-mock-imports";
import { readMockImports } from "./read-mock-imports";
import type { PlannedInsertion } from "./types";

/** Both texts of an edit, read the same way, for the audit to compare. */
export interface AuditScope {
  old: ParsedSource;
  next: ParsedSource;
  plan: PlannedInsertion;
  /** The mocks object before and after the edit. */
  before: LocatedMocks;
  after: LocatedMocks;
  /** What the edited file imports from the mock package. */
  nextImports: MockImports;
}

/**
 * Read the text before an edit and after it, and find the mocks object in
 * each the way the planner does.
 *
 * @param newText - The edited text
 * @param plan - What the plan claims
 * @returns Both readings, or what stops the audit: a text that does not
 *   parse, or a mocks object the planner itself would refuse
 *
 * @example
 * ```ts
 * const scope = openAudit(draft.text, draft.audit);
 * if (typeof scope === "string") return scope; // what stops the audit
 * ```
 */
export function openAudit(newText: string, plan: PlannedInsertion): AuditScope | string {
  const next = parseSource(plan.fileName, newText);
  if (next.problem !== null)
    return `the edited file does not parse: ${describeProblem(next, next.problem)}`;
  const old = parseSource(plan.fileName, plan.oldText);
  if (old.problem !== null)
    return `the file before the edit does not parse: ${describeProblem(old, old.problem)}`;
  const nextImports = readMockImports(next.program);
  const before = locateQuietly(old, readMockImports(old.program));
  if (typeof before === "string") return `before the edit, ${before}`;
  const after = locateQuietly(next, nextImports);
  if (typeof after === "string") return `after the edit, ${after}`;
  return { old, next, plan, before, after, nextImports };
}

/* Here the planner's refusal is not the user's to act on: it says what is
   wrong with the edited text, and the plan is rejected with it. */
function locateQuietly(parsed: ParsedSource, imports: MockImports): LocatedMocks | string {
  try {
    return locateMocksObject(parsed, imports);
  } catch (err) {
    if (err instanceof MocksEditRefusal) return err.message;
    throw err;
  }
}
