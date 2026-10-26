import {
  type PlacedEndpoint,
  pathPieces,
  standardJsonSchema,
  withDefaultsShown,
} from "@noverax/courier/internal";
import type { JSONSchema, JSONSchemaFallback } from "@noverax/courier/openapi";

import { isRecord } from "../is-record";

/** A tool's schemas, and how its arguments become the endpoint's variables. */
export interface ToolSchemas {
  readonly inputSchema: JSONSchema;
  readonly wrapsValue: boolean;
  readonly takesVariables: boolean;
  readonly outputSchema: JSONSchema | undefined;
}

/**
 * What a tool takes and answers with, as JSON Schema, from its endpoint's
 * schemas.
 *
 * A tool's arguments are an object. Variables that are one go as they are;
 * variables that are something else — a string, a list — go as `{ value }`.
 * Variables declared by their type alone have no schema to show, so the
 * tool names what its path needs and takes anything beside it. What the
 * endpoint's `.defaults()` fills in is shown with its default, and not
 * required.
 *
 * @param endpoint - The endpoint, as the API places it
 * @param fallback - A converter for a library without Standard JSON Schema
 * @returns The tool's schemas
 * @example
 * ```ts
 * toolSchemasOf(endpoint).inputSchema; // { type: "object", properties: { id: … } }
 * ```
 */
export function toolSchemasOf(
  endpoint: PlacedEndpoint,
  fallback?: JSONSchemaFallback,
): ToolSchemas {
  const { variables, defaults } = endpoint.schemas;
  const outputSchema = standardJsonSchema(endpoint.schemas.response, "output", fallback);
  const input = standardJsonSchema(variables, "input", fallback);
  if (input === undefined) {
    return {
      inputSchema: withDefaultsShown(pathParamsSchema(endpoint.path), defaults),
      wrapsValue: false,
      takesVariables: false,
      outputSchema,
    };
  }
  if (isObjectSchema(input)) {
    return {
      inputSchema: withDefaultsShown({ type: "object", ...input }, defaults),
      wrapsValue: false,
      takesVariables: true,
      outputSchema,
    };
  }
  return {
    inputSchema: {
      type: "object",
      properties: { value: input },
      required: ["value"],
      additionalProperties: false,
    },
    wrapsValue: true,
    takesVariables: true,
    outputSchema,
  };
}

/* An agent would send a `{+name}` value's slashes encoded unless it is told. */
const KEEPS_SLASHES = "May hold slashes, which are sent as written";

/* Each parameter of the path, required once however often the path holds it; anything beside them
   may be what a type alone declared. */
function pathParamsSchema(path: string): JSONSchema {
  /* Whether each parameter keeps its slashes, by its name. */
  const params = new Map<string, boolean>();
  for (const piece of pathPieces(path)) {
    if (piece.kind === "param" && !params.has(piece.name))
      params.set(piece.name, piece.keepsSlashes);
  }
  if (params.size === 0) return { type: "object" };
  const properties = Object.fromEntries(
    [...params].map(([name, keepsSlashes]) => [
      name,
      { type: ["string", "number"], ...(keepsSlashes && { description: KEEPS_SLASHES }) },
    ]),
  );
  return { type: "object", properties, required: [...params.keys()] };
}

/* An object, or a choice between objects: a tool's arguments may then be the variables themselves. */
function isObjectSchema(schema: JSONSchema): boolean {
  if (schema.type === "object") return true;
  if (schema.type !== undefined) return false;
  const choices = schema.anyOf ?? schema.oneOf;
  if (!Array.isArray(choices) || choices.length === 0) return isRecord(schema.properties);
  return choices.every((choice) => isRecord(choice) && choice.type === "object");
}
