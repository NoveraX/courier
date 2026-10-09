import type { Terminal } from "./add-courier";
import type { CreateRun } from "./create-run";
import { askYesNo } from "./prompt";

/**
 * Whether to offer the API's reads to AI agents in the editor, over MCP:
 * what the command line says, or else — where a person can answer, and the
 * command was not told to go ahead or only to show the plan — what they
 * answer. Asked before anything is changed.
 *
 * @param run - What the command line asked for
 * @param terminal - Whether a person can answer
 * @returns `true` to add the project's MCP server for the editor
 * @throws {CancelledError} When the person cancels the question
 * @example
 * ```ts
 * const mcp = await wantsMcp(run, terminal);
 * ```
 */
export async function wantsMcp(run: CreateRun, terminal: Terminal): Promise<boolean> {
  if (run.mcp !== undefined) return run.mcp;
  if (!terminal.interactive || run.yes === true || run["dry-run"] === true) return false;
  return askYesNo("Offer the API's reads to AI agents in your editor, over MCP?", false);
}
