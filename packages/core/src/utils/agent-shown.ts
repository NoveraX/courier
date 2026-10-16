import type { AgentCall } from "../agent/types";

/** An agent's call as Studio shows it. */
export interface AgentShown {
  tool: string;
  access: AgentCall["access"];
  client?: string;
}

/**
 * An agent's call as Studio is told of it: the tool, what it declared it
 * does, and the client as one line. Who the server let in stays out of
 * Studio: it is the application's to show, and may hold a token.
 *
 * @param agent - The agent call the request runs for
 * @returns The tool, its access and the client's name and version
 * @example
 * ```ts
 * agentShown({ tool: "orders_cancel", access: "destructive", client: { name: "code-editor", version: "2.1.0" } });
 * // → { tool: "orders_cancel", access: "destructive", client: "code-editor 2.1.0" }
 * ```
 */
export function agentShown(agent: AgentCall): AgentShown {
  const client =
    agent.client && [agent.client.name, agent.client.version].filter(Boolean).join(" ");
  return { tool: agent.tool, access: agent.access, ...(client && { client }) };
}
