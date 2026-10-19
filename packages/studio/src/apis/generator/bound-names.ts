import { parseSource } from "@noverax/courier-cli/devkit";
import { collectModuleBindings } from "../../server/mocks-edit/plan/module-bindings";

/**
 * Every name some statements of a module bind at its top level — its
 * imports, its declarations — read from the statements themselves, so a
 * name added to them later is counted with no list to keep in step.
 *
 * @param statements - Statements Studio writes into the module
 * @returns The names they bind
 * @throws Error When the statements do not parse, which no statement Studio writes does
 * @example
 * ```ts
 * boundNames(['import { z } from "zod";', "const { endpoint } = courier();"]); // → z, endpoint
 * ```
 */
export function boundNames(statements: readonly string[]): Set<string> {
  const parsed = parseSource("statements.ts", statements.join("\n"));
  if (parsed.problem !== null) {
    throw new Error(`Studio wrote statements it cannot read back: ${parsed.problem.message}`);
  }
  return new Set(collectModuleBindings(parsed.program).keys());
}
