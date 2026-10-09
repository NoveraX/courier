import type { AgentClient } from "@noverax/courier";
import { generateRequestId, studioHooks } from "@noverax/courier/internal";

import type { Refusal } from "../protocol/served-tool";
import type { AgentTool } from "./agent-tool";

/**
 * Show in Studio a call an agent asked for that never ran — its arguments
 * refused before a person was asked, or the person declining — so a refusal
 * is a row in the timeline rather than a gap in it. Without Studio watching,
 * nothing is reported.
 *
 * @param tool - The tool the agent called
 * @param args - The arguments it called it with
 * @param client - The client it called through, as it named itself
 * @param refusal - Why the call did not run, and the sentence the agent was told
 * @example
 * ```ts
 * reportRefusal(tool, { id: "7" }, client, { kind: "aborted", message: "Not run: the person declined orders_cancel." });
 * ```
 */
export function reportRefusal(
  tool: AgentTool,
  args: Record<string, unknown>,
  client: AgentClient | undefined,
  refusal: Refusal,
): void {
  if (studioHooks.onRequestStart === undefined) return;
  const id = generateRequestId();
  const shownClient = client && [client.name, client.version].filter(Boolean).join(" ");
  studioHooks.onRequestStart({
    id,
    source: tool.target.source,
    group: tool.target.group,
    method: tool.target.method,
    variables: args,
    mode: "direct",
    middlewareCount: 0,
    hasValidation: {
      variables: tool.variables !== undefined,
      response: tool.outputSchema !== undefined,
    },
    httpMethod: tool.verb,
    endpointType: tool.agent.access === "read" ? "query" : "mutation",
    agent: {
      tool: tool.name,
      access: tool.agent.access,
      ...(shownClient && { client: shownClient }),
    },
    timestamp: Date.now(),
  });
  studioHooks.onRequestError?.({
    id,
    /* A call over its limit never ran, as a declined one never did: Studio shows both stopped, with why. */
    error: {
      type: refusal.kind === "limited" ? "aborted" : refusal.kind,
      message: refusal.message,
    },
    timestamp: Date.now(),
  });
}
