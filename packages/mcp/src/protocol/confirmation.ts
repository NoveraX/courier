import { isRecord } from "../is-record";
import type { AgentTool } from "../tools/agent-tool";

/** The key a confirmation goes out under in `inputRequests`, and comes back under in `inputResponses`. */
export const CONFIRM_INPUT = "confirm";

/** What the person answered: ran it, said no, or closed the question. */
export type Decision = "accept" | "decline" | "cancel";

/** How much of a call's arguments a question shows before it cuts them short. */
const SHOWN_ARGUMENTS = 600;

/**
 * The `elicitation/create` params that ask a person to confirm one call: the
 * tool, what it does, its exact arguments, and that it cannot be undone. The
 * form asks for nothing beyond the answer itself.
 *
 * @param tool - The tool about to run
 * @param args - The arguments it would run with
 * @param named - Whether the revision names the form's mode (2025-11-25 on)
 * @returns The params
 * @example
 * ```ts
 * confirmationParams(tool, { id: "7" }, true); // { mode: "form", message: "…", requestedSchema: … }
 * ```
 */
export function confirmationParams(
  tool: AgentTool,
  args: Record<string, unknown>,
  named: boolean,
): Record<string, unknown> {
  const shown = JSON.stringify(args);
  const cut = shown.length > SHOWN_ARGUMENTS ? `${shown.slice(0, SHOWN_ARGUMENTS)}…` : shown;
  const message = [
    `An agent asks to run ${tool.agent.title ?? tool.name}: ${tool.agent.description}`,
    `${tool.verb} ${tool.path} with ${cut}`,
    "This cannot be undone. Run it?",
  ].join("\n\n");
  return {
    ...(named && { mode: "form" }),
    message,
    requestedSchema: { type: "object", properties: {} },
  };
}

/**
 * The person's answer in an `ElicitResult`, when it is one.
 *
 * @param result - What the client sent back for the question
 * @returns The decision, or `undefined` for what is none
 * @example
 * ```ts
 * decisionOf({ action: "accept", content: {} }); // "accept"
 * ```
 */
export function decisionOf(result: unknown): Decision | undefined {
  if (!isRecord(result)) return undefined;
  const { action } = result;
  return action === "accept" || action === "decline" || action === "cancel" ? action : undefined;
}

/**
 * Whether a client declared it can put a form to a person: `elicitation`
 * with no modes named, which is a form, or with `form` among them.
 *
 * @param capabilities - What the client declared
 * @returns Whether it can ask
 * @example
 * ```ts
 * canAsk({ elicitation: {} }); // true
 * ```
 */
export function canAsk(capabilities: Record<string, unknown> | undefined): boolean {
  const elicitation = capabilities?.elicitation;
  if (!isRecord(elicitation)) return false;
  return Object.keys(elicitation).length === 0 || "form" in elicitation;
}

/**
 * Why a destructive tool did not run: the person said no, closed the
 * question, or the client cannot ask one.
 *
 * @param tool - The tool
 * @param reason - What stopped it
 * @param transport - What the server runs over, which says how its operator lifts the rule
 * @returns The sentence the tool result carries
 * @example
 * ```ts
 * notRun(tool, "decline", "stdio"); // "Not run: the person declined orders_cancel."
 * ```
 */
export function notRun(
  tool: AgentTool,
  reason: Decision | "unasked" | "unanswered",
  transport: "stdio" | "http",
): string {
  if (reason === "decline") return `Not run: the person declined ${tool.name}.`;
  if (reason === "cancel")
    return `Not run: the person closed the confirmation for ${tool.name} without answering.`;
  if (reason === "unanswered") return `Not run: the confirmation for ${tool.name} got no answer.`;
  const lift =
    transport === "stdio"
      ? "start the server with --allow-destructive"
      : "set the handler's allowDestructive";
  return (
    `Not run: ${tool.name} cannot be undone, so a person confirms each call, and this client cannot ask one. ` +
    `Use a client that supports MCP elicitation, or ${lift} to leave the decision to the client's own approval.`
  );
}
