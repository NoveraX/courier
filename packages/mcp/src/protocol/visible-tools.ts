import type { AgentTool } from "../tools/agent-tool";
import type { McpServerOptions } from "./server-options";

/**
 * The tools a caller may see, in the order the definitions write them. A
 * tool `allow` keeps from a caller is absent from its list and unknown to
 * its calls alike, so its name is never confirmed to exist.
 *
 * @param options - The server's tools and its `allow`
 * @param principal - Who is asking
 * @returns The tools
 * @example
 * ```ts
 * visibleTools(options, principal).map((tool) => tool.name);
 * ```
 */
export function visibleTools(options: McpServerOptions, principal: unknown): readonly AgentTool[] {
  const { tools } = options.catalog();
  const { allow } = options;
  return allow === undefined ? tools : tools.filter((tool) => allow(tool, principal));
}

/**
 * One tool by its name, when the caller may see it.
 *
 * @param options - The server's tools and its `allow`
 * @param name - The tool's name
 * @param principal - Who is asking
 * @returns The tool, or `undefined` when there is none the caller may see
 * @example
 * ```ts
 * visibleTool(options, "orders_get", principal);
 * ```
 */
export function visibleTool(
  options: McpServerOptions,
  name: string,
  principal: unknown,
): AgentTool | undefined {
  const tool = options.catalog().byName.get(name);
  if (tool === undefined || (options.allow !== undefined && !options.allow(tool, principal)))
    return undefined;
  return tool;
}
