import { ConfigurationError } from "@noverax/courier";
import type { Sources } from "@noverax/courier/define";
import { eachEndpoint, type PlacedEndpoint } from "@noverax/courier/internal";
import type { JSONSchemaFallback } from "@noverax/courier/openapi";

import type { AgentTool } from "./agent-tool";
import { toolNameOf } from "./tool-name";
import { toolSchemasOf } from "./tool-schemas";

/** The tools a server offers, in the order the definitions write them, and each by its name. */
export interface Catalog {
  readonly tools: readonly AgentTool[];
  readonly byName: ReadonlyMap<string, AgentTool>;
}

/** Which sources a catalog takes its tools from, and how it writes their schemas. */
export interface CatalogOptions {
  /** The sources to offer, by their names; every one when absent. A name no source has offers nothing. */
  readonly only?: readonly string[] | undefined;
  /** A converter for schemas whose library has no Standard JSON Schema. */
  readonly jsonSchema?: JSONSchemaFallback | undefined;
}

/**
 * Every endpoint the sources offer to agents, as a tool.
 *
 * Only an endpoint that names `.agent()` is one. Its name is checked here,
 * once, where the whole set is known: two tools under one name, or a tool
 * that writes offered as a read, stop the server rather than reach a model.
 *
 * @param sources - The sources, by the names the application gave them
 * @param options - Which of them, and how their schemas are written
 * @returns The catalog
 * @throws ConfigurationError `AGENT_TOOL_NAME_TAKEN`, `AGENT_READ_ON_WRITE` or
 *   `AGENT_OPTIONS_INVALID` when a tool cannot be offered as declared
 * @example
 * ```ts
 * buildCatalog({ shop }).tools.map((tool) => tool.name); // ["orders_get", "orders_cancel"]
 * ```
 */
export function buildCatalog(sources: Sources, options: CatalogOptions = {}): Catalog {
  const names = (options.only ?? Object.keys(sources)).filter((name) =>
    Object.hasOwn(sources, name),
  );
  const byName = new Map<string, AgentTool>();
  for (const source of names) {
    for (const endpoint of eachEndpoint(sources[source] as object)) {
      const tool = toolOf(endpoint, source, names.length > 1, options.jsonSchema);
      if (tool === undefined) continue;
      const taken = byName.get(tool.name);
      if (taken !== undefined) {
        throw new ConfigurationError(
          "AGENT_TOOL_NAME_TAKEN",
          `[courier] ${taken.path} and ${tool.path} are both offered to agents as "${tool.name}": ` +
            "name one of them with .agent({ name }).",
        );
      }
      byName.set(tool.name, tool);
    }
  }
  return { tools: [...byName.values()], byName };
}

function toolOf(
  endpoint: PlacedEndpoint,
  source: string,
  prefixed: boolean,
  fallback: JSONSchemaFallback | undefined,
): AgentTool | undefined {
  const agent = endpoint.options.agent;
  if (agent === undefined) return undefined;
  const path = `${source}.${endpoint.id}`;
  if (agent.access === "read" && endpoint.kind !== "query") {
    throw new ConfigurationError(
      "AGENT_READ_ON_WRITE",
      `[courier] ${path} writes, and is offered to agents as a read, which a client would run ` +
        'without asking: give it access "write" or "destructive", or say it reads with .reads() first.',
    );
  }
  const method = endpoint.id.slice(endpoint.group === "" ? 0 : endpoint.group.length + 1);
  return {
    name: toolNameOf(endpoint.id, prefixed ? source : undefined, agent.name),
    agent,
    target: { source, group: endpoint.group === "" ? undefined : endpoint.group, method },
    path,
    verb: endpoint.method === "del" ? "DELETE" : endpoint.method.toUpperCase(),
    ...toolSchemasOf(endpoint, fallback),
    variables: endpoint.schemas.variables,
    deprecated: endpoint.options.deprecated,
  };
}
