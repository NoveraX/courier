import type { Sources } from "@noverax/courier/define";
import { eachEndpoint } from "@noverax/courier/internal";
import type { JSONSchemaFallback } from "@noverax/courier/openapi";

import { type AgentDecision, decideEndpoint } from "../policy/agent-decision";
import { type CheckedPolicy, MARKED_ONLY } from "../policy/checked-policy";
import type { AgentTool } from "./agent-tool";
import { catalogWarnings } from "./catalog-warnings";
import { type DecidedEndpoint, nameTools, verbOf } from "./name-tools";

/** One endpoint of a served source, with what the policy decided for it and the tool it became. */
export interface CatalogEntry {
  /** Its call in the client under its source: `shop.orders.cancel`. */
  readonly path: string;
  readonly source: string;
  /** The verb its call is sent with: `DELETE`. */
  readonly verb: string;
  /** Its path under the API's address: `orders/:id`. */
  readonly route: string;
  readonly decision: AgentDecision;
  /** The tool it is offered as. */
  readonly tool?: string | undefined;
  /** Why an endpoint the policy offers is left out after all: its tool's name. */
  readonly left?: string | undefined;
}

/** The tools a server offers, in the order the definitions write them, and each by its name. */
export interface Catalog {
  readonly tools: readonly AgentTool[];
  readonly byName: ReadonlyMap<string, AgentTool>;
  /** Every endpoint of the served sources, decided, in the order written. */
  readonly entries: readonly CatalogEntry[];
  /** The policy the tools were decided by. */
  readonly policy: CheckedPolicy;
  /** What the project should hear about its tools: patterns that name nothing, names left out, too many tools. */
  readonly warnings: readonly string[];
}

/** Which sources a catalog takes its tools from, by what policy, and how it writes their schemas. */
export interface CatalogOptions {
  /** The sources to offer, by their names; every one when absent. A name no source has offers nothing. */
  readonly only?: readonly string[] | undefined;
  /** A converter for schemas whose library has no Standard JSON Schema. */
  readonly jsonSchema?: JSONSchemaFallback | undefined;
  /** The project's `agents` policy, checked; the endpoints marked `.agent()` alone when absent. */
  readonly policy?: CheckedPolicy | undefined;
}

/**
 * Every endpoint the sources offer to agents, as a tool, and what the
 * policy decided for each endpoint of them.
 *
 * An endpoint is offered by its `.agent()` or by the project's `agents`
 * policy, in the policy's order. Names are checked here, once, where the
 * whole set is known: a marked tool that cannot be offered as declared
 * stops the server rather than reach a model.
 *
 * @param sources - The sources, by the names the application gave them
 * @param options - Which of them, by what policy, and how their schemas are written
 * @returns The catalog
 * @throws ConfigurationError `AGENT_TOOL_NAME_TAKEN`, `AGENT_READ_ON_WRITE` or
 *   `AGENT_OPTIONS_INVALID` when a marked tool cannot be offered as declared
 * @example
 * ```ts
 * buildCatalog({ shop }, { policy: checkedPolicy({ offer: "reads" }) }).tools.map((tool) => tool.name);
 * ```
 */
export function buildCatalog(sources: Sources, options: CatalogOptions = {}): Catalog {
  const policy = options.policy ?? MARKED_ONLY;
  const served = new Set(
    (options.only ?? Object.keys(sources)).filter((name) => Object.hasOwn(sources, name)),
  );
  const paths: string[] = [];
  const decided: DecidedEndpoint[] = [];
  for (const [source, api] of Object.entries(sources)) {
    if (typeof api !== "object" || api === null) continue;
    for (const endpoint of eachEndpoint(api)) {
      const path = `${source}.${endpoint.id}`;
      paths.push(path);
      if (served.has(source)) {
        decided.push({ endpoint, source, path, decision: decideEndpoint(endpoint, path, policy) });
      }
    }
  }
  const { tools, left } = nameTools(decided, served.size > 1, options.jsonSchema);
  const offered = [...tools.entries()].sort(([a], [b]) => a - b).map(([, tool]) => tool);
  const entries = decided.map(({ endpoint, source, path, decision }, at) => ({
    path,
    source,
    verb: verbOf(endpoint),
    route: endpoint.path,
    decision,
    tool: tools.get(at)?.name,
    left: left.get(at),
  }));
  const leftOut = entries.flatMap(({ path, left: why }) =>
    why === undefined ? [] : [{ path, why }],
  );
  return {
    tools: offered,
    byName: new Map(offered.map((tool) => [tool.name, tool])),
    entries,
    policy,
    warnings: catalogWarnings(policy, paths, leftOut, offered.length),
  };
}
