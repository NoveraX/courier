import type { ParsedSource } from "@noverax/courier-cli/devkit";
import type { Directive, Statement } from "oxc-parser";
import { previewText } from "./preview-text";
import { textOf } from "./text-of";
import type { PlannedInsertion } from "./types";

/** A statement at the top of a module, a directive among them. */
export type TopLevel = Directive | Statement;

/** The edited file's top-level statements, told apart. */
export interface SplitStatements {
  /** The statements the plan adds, in order. */
  added: TopLevel[];
  /** Every other statement, in order: the file's own. */
  kept: TopLevel[];
}

/**
 * Tell the statements a plan adds from the file's own: an added statement
 * reads exactly as the plan claims, and they appear in the claimed order.
 *
 * @param next - The edited file
 * @param plan - What the plan claims
 * @returns The split, or what is wrong
 *
 * @example
 * ```ts
 * splitStatements(scope.next, plan); // → { added: [import], kept: [the file's own statements] }
 * ```
 */
export function splitStatements(
  next: ParsedSource,
  plan: PlannedInsertion,
): SplitStatements | string {
  const added: TopLevel[] = [];
  const kept: TopLevel[] = [];
  for (const statement of next.program.body) {
    const claimed = plan.addedStatements[added.length];
    if (claimed !== undefined && textOf(next, statement) === claimed) added.push(statement);
    else kept.push(statement);
  }
  const missing = plan.addedStatements[added.length];
  if (missing === undefined) return { added, kept };
  return `the planned statement ${previewText(missing)} is not in the edited file`;
}
