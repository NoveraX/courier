import { type AgentOptions, ConfigurationError } from "@noverax/courier";
import type { PlacedEndpoint } from "@noverax/courier/internal";
import type { JSONSchemaFallback } from "@noverax/courier/openapi";

import type { AgentDecision } from "../policy/agent-decision";
import { impliedDescription } from "../policy/implied-description";
import type { AgentTool } from "./agent-tool";
import { LONGEST_TOOL_NAME, plainToolName, toolNameOf } from "./tool-name";
import { toolSchemasOf } from "./tool-schemas";

/** An endpoint of a served source, with what the policy decided for it. */
export interface DecidedEndpoint {
  readonly endpoint: PlacedEndpoint;
  readonly source: string;
  /** Its call under its source: `shop.orders.cancel`. */
  readonly path: string;
  readonly decision: AgentDecision;
}

/** The tools named, each at its endpoint's place, and why an offered endpoint has none. */
export interface NamedTools {
  readonly tools: ReadonlyMap<number, AgentTool>;
  readonly left: ReadonlyMap<number, string>;
}

/**
 * Name the tools of the offered endpoints: the marked ones first, so a
 * name `.agent()` asked for is never lost to an endpoint the policy
 * offers. A marked tool that cannot be offered as declared stops the
 * server; one the policy offers whose name is too long or taken is left
 * out, with why, since nobody chose it by name.
 *
 * @param decided - The endpoints of the served sources, in the order written
 * @param prefixed - Whether names lead with their source, as when several are served
 * @param fallback - A converter for schemas whose library has no Standard JSON Schema
 * @returns The tools by the endpoint's index, and why an offered one has none
 * @throws ConfigurationError `AGENT_READ_ON_WRITE`, `AGENT_TOOL_NAME_TAKEN` or `AGENT_OPTIONS_INVALID` for a marked tool
 * @example
 * ```ts
 * nameTools(decided, false, undefined).tools.get(0)?.name; // "orders_get"
 * ```
 */
export function nameTools(
  decided: readonly DecidedEndpoint[],
  prefixed: boolean,
  fallback: JSONSchemaFallback | undefined,
): NamedTools {
  const tools = new Map<number, AgentTool>();
  const left = new Map<number, string>();
  const byName = new Map<string, AgentTool>();
  for (const marked of [true, false]) {
    decided.forEach((placed, at) => {
      const { decision } = placed;
      if (!decision.offered || (decision.by === "marked") !== marked) return;
      const agent = placed.endpoint.options.agent;
      const tool =
        marked && agent
          ? markedTool(placed, agent, prefixed, fallback)
          : impliedTool(placed, prefixed, fallback);
      const taken = byName.get(tool.name);
      if (taken !== undefined && marked) {
        throw new ConfigurationError(
          "AGENT_TOOL_NAME_TAKEN",
          `[courier] ${taken.path} and ${tool.path} are both offered to agents as "${tool.name}": ` +
            "name one of them with .agent({ name }).",
        );
      }
      const problem =
        taken !== undefined
          ? `its tool name ${tool.name} is ${taken.path}'s`
          : tool.name.length > LONGEST_TOOL_NAME
            ? `its tool name would be longer than the ${LONGEST_TOOL_NAME} characters a client takes`
            : undefined;
      if (problem !== undefined) {
        left.set(at, `${problem}: mark it .agent({ name })`);
        return;
      }
      byName.set(tool.name, tool);
      tools.set(at, tool);
    });
  }
  return { tools, left };
}

function markedTool(
  placed: DecidedEndpoint,
  agent: AgentOptions,
  prefixed: boolean,
  fallback: JSONSchemaFallback | undefined,
): AgentTool {
  const { endpoint, source, path } = placed;
  if (agent.access === "read" && endpoint.kind !== "query") {
    throw new ConfigurationError(
      "AGENT_READ_ON_WRITE",
      `[courier] ${path} writes, and is offered to agents as a read, which a client would run ` +
        'without asking: give it access "write" or "destructive", or say it reads with .reads() first.',
    );
  }
  const name = toolNameOf(endpoint.id, prefixed ? source : undefined, agent.name);
  return toolOf(placed, name, agent, fallback);
}

function impliedTool(
  placed: DecidedEndpoint,
  prefixed: boolean,
  fallback: JSONSchemaFallback | undefined,
): AgentTool {
  const { endpoint, source, path, decision } = placed;
  const agent: AgentOptions = Object.freeze({
    description: impliedDescription(endpoint, path, verbOf(endpoint)),
    access: decision.offered ? decision.access : "read",
  });
  return toolOf(placed, plainToolName(endpoint.id, prefixed ? source : undefined), agent, fallback);
}

function toolOf(
  placed: DecidedEndpoint,
  name: string,
  agent: AgentOptions,
  fallback: JSONSchemaFallback | undefined,
): AgentTool {
  const { endpoint, source, path, decision } = placed;
  const method = endpoint.id.slice(endpoint.group === "" ? 0 : endpoint.group.length + 1);
  return {
    name,
    agent,
    offeredBy: decision.offered ? decision.by : "marked",
    confirm: decision.offered && decision.confirm,
    target: { source, group: endpoint.group === "" ? undefined : endpoint.group, method },
    path,
    verb: verbOf(endpoint),
    ...toolSchemasOf(endpoint, fallback),
    variables: endpoint.schemas.variables,
    deprecated: endpoint.options.deprecated,
  };
}

/**
 * The HTTP verb an endpoint's call is sent with: `GET`, `DELETE`.
 *
 * @param endpoint - The endpoint
 * @returns The verb
 * @example
 * ```ts
 * verbOf(placed); // "DELETE"
 * ```
 */
export function verbOf(endpoint: PlacedEndpoint): string {
  return endpoint.method === "del" ? "DELETE" : endpoint.method.toUpperCase();
}
