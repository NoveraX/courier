import type { JSONSchema } from "@noverax/courier/openapi";

import { hasStructuredOutput, type LegacyVersion, type ModernVersion } from "../protocol/versions";
import type { AgentTool } from "./agent-tool";
import type { StructuredOutput } from "./tool-result";

const IDEMPOTENT_VERBS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

/**
 * How a revision carries a call's answer as data: any JSON since 2026-07-28,
 * an object alone before it, nothing before 2025-06-18.
 *
 * @param version - The revision a request is served under
 * @returns What its results carry beside their text
 * @example
 * ```ts
 * structuredOutputOf("2025-06-18"); // "object"
 * ```
 */
export function structuredOutputOf(version: LegacyVersion | ModernVersion): StructuredOutput {
  if (!hasStructuredOutput(version)) return "none";
  return version === "2026-07-28" ? "any" : "object";
}

/**
 * The output schema a client is shown for a tool: none under a revision
 * that carries no data, and under one that carries an object alone, none
 * for an answer that is something else.
 *
 * @param tool - The tool
 * @param structured - What the revision carries
 * @returns The schema to show, if any
 * @example
 * ```ts
 * shownOutputSchema(tool, "object");
 * ```
 */
export function shownOutputSchema(
  tool: AgentTool,
  structured: StructuredOutput,
): JSONSchema | undefined {
  if (structured === "none" || tool.outputSchema === undefined) return undefined;
  if (structured === "object" && tool.outputSchema.type !== "object") return undefined;
  return tool.outputSchema;
}

/**
 * A tool as `tools/list` describes it under a revision: its name, what it
 * does, what it takes and answers with, and the hints a client asks a
 * person by — read-only, destructive, idempotent, reaching beyond itself.
 *
 * @param tool - The tool
 * @param version - The revision the list is served under
 * @returns The tool's entry
 * @example
 * ```ts
 * toolDefinition(tool, "2026-07-28"); // { name: "orders_get", description: "…", … }
 * ```
 */
export function toolDefinition(
  tool: AgentTool,
  version: LegacyVersion | ModernVersion,
): Record<string, unknown> {
  const { title, access } = tool.agent;
  const outputSchema = shownOutputSchema(tool, structuredOutputOf(version));
  const description =
    tool.deprecated === undefined
      ? tool.agent.description
      : `${tool.agent.description}\n\nDeprecated: ${tool.deprecated}`;
  return {
    name: tool.name,
    ...(title !== undefined && hasStructuredOutput(version) && { title }),
    description,
    inputSchema: tool.inputSchema,
    ...(outputSchema !== undefined && { outputSchema }),
    annotations: {
      ...(title !== undefined && { title }),
      readOnlyHint: access === "read",
      destructiveHint: access === "destructive",
      idempotentHint: IDEMPOTENT_VERBS.has(tool.verb),
      openWorldHint: true,
    },
  };
}
