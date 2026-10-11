import type { AgentAccess } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import type { Sources } from "@noverax/courier/define";
import { buildCatalog, checkedPolicy, decisionReason } from "@noverax/courier-mcp/internal";

import { messageOf } from "../../server/message-of";

/** A tool the project offers to agents, as the diff compares them. */
export interface OfferedTool {
  /** Its endpoint's call under its source: `shop.orders.cancel`. */
  readonly path: string;
  readonly tool: string;
  readonly access: AgentAccess;
  /** Whether a person confirms each call. */
  readonly confirm: boolean;
  /** What offered it: `marked .agent()`, `offer: "reads"`. */
  readonly reason: string;
}

/** What agents may call at one side of the diff, or why the MCP server would not start there. */
export type AgentSurface =
  | { readonly tools: readonly OfferedTool[] }
  | { readonly problem: string };

/** A tool offered on both sides, offered differently. */
export interface ChangedTool {
  readonly before: OfferedTool;
  readonly after: OfferedTool;
}

/** What a change does to what agents may call. */
export interface AgentChanges {
  /** Tools the change offers that were not offered before. */
  readonly added: readonly OfferedTool[];
  /** Tools offered before that the change keeps from agents. */
  readonly removed: readonly OfferedTool[];
  /** Tools offered on both sides under another name, access or confirmation. */
  readonly changed: readonly ChangedTool[];
  /** How many tools agents may call after the change, when its server starts. */
  readonly offered: number;
  /** Whether the base records what agents could call: OpenAPI documents written before do not. */
  readonly baseRecorded: boolean;
  /** Where the MCP server would not start — before the change or after it — and why. */
  readonly problems: readonly { readonly side: "base" | "head"; readonly message: string }[];
}

/**
 * What a project offers to agents, by its config's `agents` policy, as the
 * MCP server would offer it.
 *
 * @param config - The config, at one side of the diff
 * @returns The tools, or why the server would not start
 * @example
 * ```ts
 * agentSurfaceOf(config); // { tools: [{ path: "shop.orders.get", tool: "orders_get", access: "read", … }] }
 * ```
 */
export function agentSurfaceOf(config: Pick<CourierConfig, "sources" | "agents">): AgentSurface {
  try {
    const catalog = buildCatalog((config.sources ?? {}) as Sources, {
      policy: checkedPolicy(config.agents),
    });
    const tools = catalog.entries.flatMap((entry) =>
      entry.tool !== undefined && entry.decision.offered
        ? [
            {
              path: entry.path,
              tool: entry.tool,
              access: entry.decision.access,
              confirm: entry.decision.confirm,
              reason: decisionReason(entry.decision, catalog.policy),
            },
          ]
        : [],
    );
    return { tools };
  } catch (error) {
    return { problem: messageOf(error) };
  }
}

/**
 * What a change does to what agents may call: the tools it adds, those it
 * keeps from agents, and those it offers under another name, access or
 * confirmation.
 *
 * @param base - What agents could call before; `undefined` when the base does not record it
 * @param head - What agents may call after the change
 * @returns The changes
 * @example
 * ```ts
 * agentChanges(agentSurfaceOf(baseConfig), agentSurfaceOf(config)).added.map((tool) => tool.tool);
 * ```
 */
export function agentChanges(base: AgentSurface | undefined, head: AgentSurface): AgentChanges {
  const before = base !== undefined && "tools" in base ? base.tools : [];
  const after = "tools" in head ? head.tools : [];
  const byPath = new Map(before.map((tool) => [tool.path, tool]));
  const kept = new Set(after.map((tool) => tool.path));
  const problems = [
    ...(base !== undefined && "problem" in base
      ? [{ side: "base" as const, message: base.problem }]
      : []),
    ...("problem" in head ? [{ side: "head" as const, message: head.problem }] : []),
  ];
  return {
    added: base === undefined ? [] : after.filter((tool) => !byPath.has(tool.path)),
    removed: before.filter((tool) => !kept.has(tool.path)),
    changed: after.flatMap((tool) => {
      const was = byPath.get(tool.path);
      return was !== undefined && offeredDifferently(was, tool)
        ? [{ before: was, after: tool }]
        : [];
    }),
    offered: after.length,
    baseRecorded: base !== undefined,
    problems,
  };
}

function offeredDifferently(before: OfferedTool, after: OfferedTool): boolean {
  return (
    before.tool !== after.tool || before.access !== after.access || before.confirm !== after.confirm
  );
}
