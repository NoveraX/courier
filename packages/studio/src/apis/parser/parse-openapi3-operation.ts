/**
 * OpenAPI 3.x operation parser — converts a single path+method into ParsedEndpoint.
 */

import type { ParsedEndpoint, ParsedParameter, ParsedSchema, SpecNode } from "./types";
import {
  convertPathParams,
  convertSchemaInline,
  generateEndpointName,
  resolveRef,
  toCamelCase,
} from "./utils";

export function parseOpenApi3Operation(
  path: string,
  method: string,
  op: SpecNode,
  spec: SpecNode,
): ParsedEndpoint {
  const parameters = parseParameters(op, spec);
  const requestBody = parseRequestBody(op, spec);
  const responseSchema = parseResponseSchema(op, spec);

  const secured = !!(op.security?.length > 0 || (!op.security && spec.security?.length > 0));
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

function parseParameters(op: SpecNode, spec: SpecNode): ParsedParameter[] {
  const parameters: ParsedParameter[] = [];
  const seen = new Set<string>();

  for (const param of op.parameters ?? []) {
    const resolved = param?.$ref ? resolveRef(spec, param.$ref) : param;
    /* A reference into another file, or one this specification never
       defines, resolves to nothing — reading a name off it threw and took
       the whole import down. */
    if (typeof resolved?.name !== "string") continue;

    const name = resolved.name.replace(/-/g, "_");
    const key = `${resolved.in}:${name}`;
    /* An operation may restate a parameter its path item already declared. */
    if (seen.has(key)) continue;
    seen.add(key);

    parameters.push({
      name,
      in: resolved.in,
      required: resolved.required ?? false,
      /* Swagger 2.0 writes the type on the parameter itself; OpenAPI 3 puts
         it in a schema. */
      type: resolved.schema?.type ?? resolved.type ?? "string",
      description: resolved.description ?? "",
    });
  }
  return parameters;
}

function parseRequestBody(op: SpecNode, spec: SpecNode): ParsedSchema | null {
  if (!op.requestBody) return null;
  const body = op.requestBody.$ref ? resolveRef(spec, op.requestBody.$ref) : op.requestBody;
  /* Stripe sends every body as form-encoded and Twilio does the same; reading
     only `application/json` dropped all 594 and all 62 of them. */
  const schema = firstSchemaIn(body?.content);
  return schema ? convertSchemaInline(schema, spec) : null;
}

/** Media types that carry a JSON schema, in the order worth preferring. */
function firstSchemaIn(content: SpecNode | undefined): SpecNode | undefined {
  if (!content || typeof content !== "object") return undefined;
  const preferred = content["application/json"]?.schema;
  if (preferred) return preferred;
  for (const media of Object.values(content)) {
    const schema = (media as SpecNode | undefined)?.schema;
    if (schema) return schema;
  }
  return undefined;
}

function parseResponseSchema(op: SpecNode, spec: SpecNode): ParsedSchema | null {
  const success = successResponse(op.responses);
  if (!success) return null;
  const resp = success.$ref ? resolveRef(spec, success.$ref) : success;
  const schema = firstSchemaIn(resp?.content);
  return schema ? convertSchemaInline(schema, spec) : null;
}

/**
 * The response a caller gets on success.
 *
 * Reading only `200` and `201` dropped the schema of every endpoint that
 * answers `202`, `204` with content, or the `2XX` wildcard.
 */
function successResponse(responses: SpecNode | undefined): SpecNode | undefined {
  if (!responses || typeof responses !== "object") return undefined;
  for (const code of ["200", "201", "202", "203", "2XX", "2xx", "default"]) {
    const response = responses[code];
    if (response) return response;
  }
  for (const [code, response] of Object.entries(responses)) {
    if (code.startsWith("2") && response) return response as SpecNode;
  }
  return undefined;
}
