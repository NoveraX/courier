/**
 * Extracts inline response/variable schemas from endpoints as named types.
 * Inline objects become named types in the schemas/types file.
 */

import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSchema,
  ParsedSchemaProperty,
} from "../parser/types";

export interface ExtractedTypes {
  /** Modified group with response refs instead of inline schemas */
  group: ParsedGroup;
  /** Additional named schemas (response types + param types) */
  schemas: Record<string, ParsedSchema>;
}

/** Extract inline response objects and complex params as named types */
export function extractEndpointTypes(group: ParsedGroup): ExtractedTypes {
  const schemas: Record<string, ParsedSchema> = {};
  const endpoints: ParsedEndpoint[] = [];

  for (const ep of group.endpoints) {
    let responseSchema = ep.responseSchema;

    if (shouldExtractResponse(responseSchema)) {
      const name = toPascalCase(ep.name) + "Response";
      schemas[name] = responseSchema!;
      responseSchema = { name, type: "ref", refName: name };
    }

    const paramsSchema = buildParamsSchema(ep);
    if (paramsSchema) {
      schemas[toPascalCase(ep.name) + "Params"] = paramsSchema;
    }

    endpoints.push(responseSchema !== ep.responseSchema ? { ...ep, responseSchema } : ep);
  }

  return { group: { ...group, endpoints }, schemas };
}

function shouldExtractResponse(schema: ParsedSchema | null): boolean {
  if (!schema || schema.type === "ref") return false;
  if (schema.type === "object" && schema.properties)
    return Object.keys(schema.properties).length > 0;
  if (schema.type === "array" && schema.items?.type === "object" && schema.items.properties)
    return true;
  /* A response that is one of several shapes — a list or `null`, say — is
     only validated through a named schema; written inline it was a type the
     answer was never checked against. */
  return schema.type === "union" && (schema.variants?.length ?? 0) > 0;
}

/** Build a ParsedSchema from path + query params (when no body ref handles them) */
function buildParamsSchema(ep: ParsedEndpoint): ParsedSchema | null {
  if (ep.requestBody?.type === "ref") return null;
  const params = ep.parameters.filter((p) => p.in === "path" || p.in === "query");
  if (params.length < 2 && !params.some((p) => p.description)) return null;

  const properties: Record<string, ParsedSchemaProperty> = {};
  const required: string[] = [];

  for (const param of params) {
    properties[param.name] = {
      type: param.type || "string",
      required: param.required || param.in === "path",
      description: param.description || undefined,
    };
    if (param.required || param.in === "path") required.push(param.name);
  }

  if (Object.keys(properties).length === 0) return null;
  return { name: "", type: "object", properties, required };
}

function toPascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
