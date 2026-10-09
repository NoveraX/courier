import type { JSONSchema } from "@noverax/courier/openapi";

import { limitText } from "./limit-text";
import type { ServedTool } from "./served-tool";
import type { StructuredOutput } from "./tool-result";
import { hasStructuredOutput, type LegacyVersion, type ModernVersion } from "./versions";

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
  tool: ServedTool,
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
  tool: ServedTool,
  version: LegacyVersion | ModernVersion,
): Record<string, unknown> {
  const { title, access } = tool;
  const outputSchema = shownOutputSchema(tool, structuredOutputOf(version));
  return {
    name: tool.name,
    ...(title !== undefined && hasStructuredOutput(version) && { title }),
    description:
      tool.limit === undefined
        ? tool.description
        : `${tool.description}\n\nTakes at most ${limitText(tool.limit)} from each caller; a call beyond that is refused, with when to call again.`,
    inputSchema: tool.inputSchema,
    ...(outputSchema !== undefined && { outputSchema }),
    annotations: {
      ...(title !== undefined && { title }),
      readOnlyHint: access === "read",
      destructiveHint: access === "destructive",
      idempotentHint: tool.idempotent,
      openWorldHint: true,
    },
  };
}
