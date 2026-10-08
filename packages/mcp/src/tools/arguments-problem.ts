import { ValidationError } from "@noverax/courier";

import type { AgentTool } from "./agent-tool";
import { failureMessage } from "./failure-message";

/**
 * What is wrong with a call's arguments by the endpoint's own schema, before
 * anything runs: a person is never asked to confirm a call that could not
 * run as written.
 *
 * @param tool - The tool
 * @param args - Its arguments, as the client sent them
 * @returns The sentence saying what is wrong, or `undefined` when nothing is
 * @example
 * ```ts
 * await argumentsProblem(tool, { id: 7 }); // "The arguments do not match what the tool takes:\n- id: …"
 * ```
 */
export async function argumentsProblem(
  tool: AgentTool,
  args: Record<string, unknown>,
): Promise<string | undefined> {
  if (tool.variables === undefined) return undefined;
  const result = await tool.variables["~standard"].validate(tool.wrapsValue ? args.value : args);
  return result.issues
    ? failureMessage(new ValidationError("variables", result.issues))
    : undefined;
}
