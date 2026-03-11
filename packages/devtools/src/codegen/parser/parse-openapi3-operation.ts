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
  for (const param of op.parameters ?? []) {
    const resolved = param.$ref ? resolveRef(spec, param.$ref) : param;
    parameters.push({
      name: (resolved.name as string).replace(/-/g, "_"),
      in: resolved.in,
      required: resolved.required ?? false,
      type: resolved.schema?.type ?? "string",
      description: resolved.description ?? "",
    });
  }
  return parameters;
}

function parseRequestBody(op: SpecNode, spec: SpecNode): ParsedSchema | null {
  if (!op.requestBody) return null;
  const body = op.requestBody.$ref ? resolveRef(spec, op.requestBody.$ref) : op.requestBody;
  const jsonContent = body.content?.["application/json"];
  if (!jsonContent?.schema) return null;
  return convertSchemaInline(jsonContent.schema, spec);
}

function parseResponseSchema(op: SpecNode, spec: SpecNode): ParsedSchema | null {
  const successResponse = op.responses?.["200"] ?? op.responses?.["201"];
  if (!successResponse) return null;
  const resp = successResponse.$ref ? resolveRef(spec, successResponse.$ref) : successResponse;
  const jsonContent = resp.content?.["application/json"];
  if (!jsonContent?.schema) return null;
  return convertSchemaInline(jsonContent.schema, spec);
}
