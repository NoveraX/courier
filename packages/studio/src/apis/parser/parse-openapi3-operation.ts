/**
 * OpenAPI 3.x operation parser — converts a single path+method into ParsedEndpoint.
 */

import { parseRequestBody } from "./parse-request-body";
import { parseResponse } from "./parse-response";
import type { ParsedEndpoint, ParsedParameter, SpecNode } from "./types";
import {
  convertPathParams,
  convertSchemaInline,
  generateEndpointName,
  normalizeTypeArray,
  pathParamName,
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
  const body = parseRequestBody(op, spec);
  /* A HEAD answer never carries the body its GET would: a schema for it made
     every call fail validation on the null the client reads. */
  const response = method === "head" ? { responseSchema: null } : parseResponse(op, spec);

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
    ...body,
    parameters,
    ...response,
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

    /* Only a path parameter is renamed, to be a placeholder the path can
       hold; a query parameter is sent under its own name, and renaming
       `page-size` sent `page_size`, which the API does not read. */
    const name = resolved.in === "path" ? pathParamName(resolved.name) : resolved.name;
    const key = `${resolved.in}:${name}`;
    /* An operation may restate a parameter its path item already declared. */
    if (seen.has(key)) continue;
    seen.add(key);

    /* Swagger 2.0 writes the shape on the parameter itself; OpenAPI 3 puts
       it in a schema. */
    const shape = normalizeTypeArray(resolved.schema ?? resolved);
    parameters.push({
      name,
      in: resolved.in,
      required: resolved.required ?? false,
      type: shape.type ?? "string",
      description: resolved.description ?? "",
      /* Reduced to a bare type name, a parameter lost the values it accepts
         and the element type of an array. */
      ...(shape.enum && { enum: shape.enum }),
      ...(shape.format && { format: shape.format }),
      ...(shape.items && { items: convertSchemaInline(shape.items, spec) }),
      ...(isStructured(shape) && { schema: convertSchemaInline(shape, spec) }),
    });
  }
  return parameters;
}

/** Whether a parameter's schema is more than a type name and its values. */
function isStructured(shape: SpecNode): boolean {
  return Boolean(
    shape.oneOf || shape.anyOf || shape.allOf || shape.properties || shape.type === "object",
  );
}
