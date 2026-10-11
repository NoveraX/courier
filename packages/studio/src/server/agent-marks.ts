import type { AgentAccess } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import type { Sources } from "@noverax/courier/define";
import { eachEndpoint } from "@noverax/courier/internal";
import { buildCatalog, checkedPolicy, decisionReason } from "@noverax/courier-mcp/internal";

import { messageOf } from "./message-of";

/** What the project's `agents` policy decided for one endpoint, as Studio shows it. */
export interface AgentMark {
  /** Whether an agent can call it, as a tool of the project's MCP server. */
  offered: boolean;
  /** The tool it is offered as. */
  tool?: string;
  /** What a call does — offered, or kept out by the policy's `access`. */
  access?: AgentAccess;
  /** Whether a person confirms each call. */
  confirm?: boolean;
  /** Why, in the words the config uses: `marked .agent()`, `denied by billing.**`. */
  reason: string;
}

/**
 * What the project's `agents` policy decides for every endpoint of its
 * sources, by its call under its source — `shop.orders.cancel` — as the
 * MCP server would offer them. A stream or a channel, which no tool can
 * be, has no mark. Where the policy, or a tool marked `.agent()`, cannot
 * be offered as written, the server would not start, so every endpoint
 * is marked kept out with that one reason.
 *
 * @param config - The config Studio runs
 * @returns The marks, by each endpoint's call
 * @example
 * ```ts
 * agentMarks(config).get("shop.orders.get"); // { offered: true, tool: "orders_get", access: "read", confirm: false, reason: 'offer: "reads"' }
 * ```
 */
export function agentMarks(
  config: Pick<CourierConfig, "sources" | "agents">,
): Map<string, AgentMark> {
  const sources = (config.sources ?? {}) as Sources;
  try {
    const catalog = buildCatalog(sources, { policy: checkedPolicy(config.agents) });
    const marks = new Map<string, AgentMark>();
    for (const entry of catalog.entries) {
      const { decision } = entry;
      if (decision.by === "kind") continue;
      marks.set(entry.path, {
        offered: entry.tool !== undefined,
        ...(entry.tool !== undefined && { tool: entry.tool }),
        ...(decision.access !== undefined && { access: decision.access }),
        ...(decision.offered && { confirm: decision.confirm }),
        reason: entry.left ?? decisionReason(decision, catalog.policy),
      });
    }
    return marks;
  } catch (error) {
    return everyEndpointKept(sources, `the MCP server would not start: ${messageOf(error)}`);
  }
}

function everyEndpointKept(sources: Sources, reason: string): Map<string, AgentMark> {
  const marks = new Map<string, AgentMark>();
  for (const [source, api] of Object.entries(sources)) {
    if (typeof api !== "object" || api === null) continue;
    for (const endpoint of eachEndpoint(api)) {
      if (endpoint.kind === "stream" || endpoint.kind === "channel") continue;
      marks.set(`${source}.${endpoint.id}`, { offered: false, reason });
    }
  }
  return marks;
}
