import { type ServedTool, type ToolSet, toolSet } from "../protocol/served-tool";
import type { AgentTool } from "./agent-tool";
import { argumentsProblem } from "./arguments-problem";
import type { Catalog } from "./catalog";
import { reportRefusal } from "./report-refusal";
import { runTool } from "./run-tool";
import type { ToolSource } from "./tool-source";

const IDEMPOTENT_VERBS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

/**
 * The endpoints offered to agents, as tools a protocol server offers: each
 * one's call runs through the endpoint, its arguments are checked by its
 * variables schema before a person is asked, and a call refused shows in
 * Studio. The set is rebuilt when the sources it comes from change.
 *
 * @param source - Where the tools and the sources they call come from
 * @param timeoutMs - How long a call may take when its endpoint names no timeout
 * @returns The tool set in force, read per request
 * @example
 * ```ts
 * createMcpServer({ tools: courierTools(toolSource({ shop }, {}), 60_000), … });
 * ```
 */
export function courierTools(source: ToolSource, timeoutMs: number): () => ToolSet {
  let built: { catalog: Catalog; set: ToolSet } | undefined;
  return () => {
    const catalog = source.catalog();
    if (built?.catalog !== catalog) {
      built = {
        catalog,
        set: toolSet(catalog.tools.map((tool) => servedOf(tool, source, timeoutMs))),
      };
    }
    return built.set;
  };
}

function servedOf(tool: AgentTool, source: ToolSource, timeoutMs: number): ServedTool {
  const { description, title, access, limit } = tool.agent;
  return {
    name: tool.name,
    title,
    description:
      tool.deprecated === undefined
        ? description
        : `${description}\n\nDeprecated: ${tool.deprecated}`,
    access,
    confirm: tool.confirm,
    limit,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    idempotent: IDEMPOTENT_VERBS.has(tool.verb),
    action: `${tool.verb} ${tool.path}`,
    check: (args) => argumentsProblem(tool, args),
    run: (args, caller) => runTool(tool, args, { ...caller, sources: source.sources(), timeoutMs }),
    refused: (args, caller, refusal) => reportRefusal(tool, args, caller.client, refusal),
  };
}
