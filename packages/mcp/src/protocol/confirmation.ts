import { isRecord } from "../is-record";
import type { ServedTool } from "./served-tool";
import type { McpServerOptions } from "./server-options";

/** The key a confirmation goes out under in `inputRequests`, and comes back under in `inputResponses`. */
export const CONFIRM_INPUT = "confirm";

/** What the person answered: ran it, said no, or closed the question. */
export type Decision = "accept" | "decline" | "cancel";

/** How much of a call's arguments a question shows before it cuts them short. */
const SHOWN_ARGUMENTS = 600;

/**
 * The call a person is asked to confirm, as it goes out: the tool's own
 * account of it, when its arguments decide what it does, or its action with
 * its exact arguments, cut short when they run long.
 *
 * @param tool - The tool about to run
 * @param args - The arguments it would run with
 * @returns The line the question shows
 * @example
 * ```ts
 * await shownCall(tool, { id: "7" }); // 'POST shop.orders.cancel with {"id":"7"}'
 * ```
 */
export async function shownCall(tool: ServedTool, args: Record<string, unknown>): Promise<string> {
  if (tool.confirming !== undefined) return tool.confirming(args);
  const shown = JSON.stringify(args);
  const cut = shown.length > SHOWN_ARGUMENTS ? `${shown.slice(0, SHOWN_ARGUMENTS)}…` : shown;
  return `${tool.action} with ${cut}`;
}

/**
 * The `elicitation/create` params that ask a person to confirm one call: the
 * tool, what it does, the call as it goes out, and that it cannot be undone.
 * The form asks for nothing beyond the answer itself.
 *
 * @param tool - The tool about to run
 * @param shown - The call as it goes out, from `shownCall`
 * @param named - Whether the revision names the form's mode (2025-11-25 on)
 * @returns The params
 * @example
 * ```ts
 * confirmationParams(tool, await shownCall(tool, { id: "7" }), true); // { mode: "form", message: "…", requestedSchema: … }
 * ```
 */
export function confirmationParams(
  tool: ServedTool,
  shown: string,
  named: boolean,
): Record<string, unknown> {
  const message = [
    `An agent asks to run ${tool.title ?? tool.name}: ${tool.description}`,
    shown,
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
 * question, or the client cannot ask one — which says what to do instead.
 *
 * @param tool - The tool
 * @param reason - What stopped it
 * @param options - What the server runs over, which says how its operator
 *   lifts the rule, and what it says to do instead when it says so itself
 * @returns The sentence the tool result carries
 * @example
 * ```ts
 * notRun(tool, "decline", { transport: "stdio" }); // "Not run: the person declined orders_cancel."
 * ```
 */
export function notRun(
  tool: ServedTool,
  reason: Decision | "unasked" | "unanswered",
  options: Pick<McpServerOptions, "transport" | "unasked">,
): string {
  if (reason === "decline") return `Not run: the person declined ${tool.name}.`;
  if (reason === "cancel")
    return `Not run: the person closed the confirmation for ${tool.name} without answering.`;
  if (reason === "unanswered") return `Not run: the confirmation for ${tool.name} got no answer.`;
  const lift =
    options.transport === "stdio"
      ? "start the server with --allow-destructive"
      : "set the handler's allowDestructive";
  const instead = options.unasked ?? `${lift} to leave the decision to the client's own approval`;
  return (
    `Not run: ${tool.name} cannot be undone, so a person confirms each call, and this client cannot ask one. ` +
    `Use a client that supports MCP elicitation, or ${instead}.`
  );
}
