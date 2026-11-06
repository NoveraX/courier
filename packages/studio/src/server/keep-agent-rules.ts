import { createLogger } from "@noverax/courier";
import { updateAgentRules } from "@noverax/courier-cli/devkit";

const log = createLogger("Studio");

/**
 * Bring Courier's block in the project's AGENTS.md up to date, as Studio
 * starts: only a block that is there — one a person deleted stays deleted —
 * and nothing in the file outside its markers. A file whose block cannot
 * be told apart, or that cannot be written, is left as it is, and the log
 * says why.
 *
 * @param root - The project's root, links resolved
 * @example
 * ```ts
 * keepAgentRules(root);
 * ```
 */
export function keepAgentRules(root: string): void {
  const update = updateAgentRules(root);
  if (update?.kind === "updated") log.info(`Brought Courier's block in ${update.path} up to date`);
  else if (update?.kind === "left") log.warn(`${update.path} was left as it is: ${update.why}`);
}
