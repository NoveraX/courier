/**
 * OpenAPI 3.x specification parser.
 */

import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedParameter,
  ParsedSchema,
  ParsedSpec,
} from "./types";
import {
  convertPathParams,
  convertSchema,
  convertSchemaInline,
  findCommonPrefix,
  generateEndpointName,
  parseSecuritySchemes,
  resolveRef,
  stripHtml,
  stripHtmlPreserveNewlines,
  toCamelCase,
  toSafeIdentifier,
} from "./utils";

export function parseOpenApi3(spec: any): ParsedSpec {
  const title = spec.info?.title ?? "API";
  const version = spec.info?.version ?? "1.0.0";
  const description = spec.info?.description
    ? stripHtmlPreserveNewlines(spec.info.description)
    : "";

  // Determine base URL
  let baseURL = "/";
  if (spec.servers?.length > 0) {
    baseURL = spec.servers[0].url ?? "/";
  }

  const schemas: Record<string, ParsedSchema> = {};
  if (spec.components?.schemas) {
    for (const [name, schema] of Object.entries(spec.components.schemas)) {
      const safeName = toSafeIdentifier(name);
      if (schemas[safeName]) continue;
      schemas[safeName] = convertSchema(safeName, schema as any);
    }
  }

  const endpointsByTag = new Map<string, ParsedEndpoint[]>();

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods as any)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;

      const op = operation as any;
      const tags = op.tags?.length > 0 ? op.tags : ["default"];
      const tag = tags[0] as string;

      const endpoint = parseOpenApi3Operation(path, method, op, spec);
      endpoint.tags = tags;

      if (!endpointsByTag.has(tag)) endpointsByTag.set(tag, []);
      endpointsByTag.get(tag)?.push(endpoint);
    }
  }

  // Build tag description map from top-level tags array
  const tagDescriptions = new Map<string, string>();
  if (Array.isArray(spec.tags)) {
    for (const tag of spec.tags) {
      if (tag.name && tag.description) {
        tagDescriptions.set(tag.name, stripHtml(tag.description));
      }
    }
  }

  const groups: ParsedGroup[] = [];
  const usedNames = new Set<string>();
  for (const [tag, endpoints] of endpointsByTag) {
    const prefix = findCommonPrefix(endpoints.map((e) => e.fullPath));
    let name = toCamelCase(tag);

    // Fallback for empty names (e.g. Cyrillic-only tags that became empty)
    if (!name) {
      const lastSegment = prefix.split("/").filter(Boolean).pop();
      name = lastSegment ? toCamelCase(lastSegment) : "default";
    }

    // Deduplicate group names
    if (usedNames.has(name)) {
      let i = 2;
      while (usedNames.has(`${name}${i}`)) i++;
      name = `${name}${i}`;
    }
    usedNames.add(name);

    groups.push({
      name,
      description: tagDescriptions.get(tag) ?? "",
      prefix,
      endpoints: endpoints.map((e) => ({
        ...e,
        path: convertPathParams(e.fullPath.slice(prefix.length) || "/"),
      })),
    });
  }

  const securitySchemes = parseSecuritySchemes(spec);

  return {
    title,
    version,
    description,
    baseURL,
    format: "openapi3",
    groups,
    schemas,
    securitySchemes,
  };
}

function parseOpenApi3Operation(path: string, method: string, op: any, spec: any): ParsedEndpoint {
  // Parameters
  const parameters: ParsedParameter[] = [];
  for (const param of op.parameters ?? []) {
    const resolved = param.$ref ? resolveRef(spec, param.$ref) : param;
    const name = (resolved.name as string).replace(/-/g, "_");
    parameters.push({
      name,
      in: resolved.in,
      required: resolved.required ?? false,
      type: resolved.schema?.type ?? "string",
      description: resolved.description ?? "",
    });
  }

  // Request body
  let requestBody: ParsedSchema | null = null;
  if (op.requestBody) {
    const body = op.requestBody.$ref ? resolveRef(spec, op.requestBody.$ref) : op.requestBody;
    const jsonContent = body.content?.["application/json"];
    if (jsonContent?.schema) {
      requestBody = convertSchemaInline(jsonContent.schema, spec);
    }
  }

  // Response schema (200 or 201)
  let responseSchema: ParsedSchema | null = null;
  const successResponse = op.responses?.["200"] ?? op.responses?.["201"];
  if (successResponse) {
    const resp = successResponse.$ref ? resolveRef(spec, successResponse.$ref) : successResponse;
    const jsonContent = resp.content?.["application/json"];
    if (jsonContent?.schema) {
      responseSchema = convertSchemaInline(jsonContent.schema, spec);
    }
  }

  // Security
  const secured = !!(op.security?.length > 0 || (!op.security && spec.security?.length > 0));

  // Name
  const operationId = op.operationId ?? null;
  const name = operationId ? toCamelCase(operationId) : generateEndpointName(method, path);

  return {
    name,
    operationId,
    httpMethod: method as ParsedEndpoint["httpMethod"],
    path: convertPathParams(path),
    fullPath: path,
    description: op.summary ?? op.description ?? "",
    secured,
    requestBody,
    parameters,
    responseSchema,
    tags: [],
  };
}
