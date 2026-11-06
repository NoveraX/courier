import type { CreateRun } from "./create-run";
import type { SetupIO } from "./setup-io";

/**
 * Whether to offer the API's reads to AI agents in the editor, over MCP:
 * what the command line says, or else — where a person can answer, and the
 * command was not told to go ahead or only to show the plan — what they
 * answer. Asked before anything is changed.
 *
 * @param run - What the command line asked for
 * @param io - Whether a person can answer
 * @returns `true` to add the project's MCP server for the editor
 * @throws {CancelledError} When the person cancels the question
 * @example
 * ```ts
 * const mcp = await wantsMcp(run, io);
 * ```
 */
export async function wantsMcp(run: CreateRun, io: SetupIO): Promise<boolean> {
  if (run.mcp !== undefined) return run.mcp;
  if (io.questions === undefined || run.yes === true || run["dry-run"] === true) return false;
  return io.questions.confirm(
    "Offer the API's reads to AI agents in your editor, over MCP?",
    false,
  );
}
