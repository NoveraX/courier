/**
 * OpenAPI 3.x operation parser — converts a single path+method into ParsedEndpoint.
 */

import { collectionEncoding, declaredEncoding, isDefaultEncoding } from "./field-encoding";
import type { SupportedHttpMethod } from "./http-methods";
import { parseRequestBody } from "./parse-request-body";
import { parseResponse } from "./parse-response";
import { enumValues } from "./schema-conversion";
import { asNode, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedEndpoint, ParsedParameter } from "./types";
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
  method: SupportedHttpMethod,
  op: SpecNode,
  spec: SpecNode,
): ParsedEndpoint {
  const parameters = parseParameters(op, spec);
  const body = parseRequestBody(op, spec);
  /* A HEAD answer never carries the body its GET would: a schema for it made
     every call fail validation on the null the client reads. */
  const response = method === "head" ? { responseSchema: null } : parseResponse(op, spec);

  const secured =
    listAt(op, "security").length > 0 || (!op.security && listAt(spec, "security").length > 0);
  const operationId = textAt(op, "operationId") ?? null;
  const name = operationId ? toCamelCase(operationId) : generateEndpointName(method, path);

  return {
    name,
    operationId,
    httpMethod: method,
    path: convertPathParams(path),
    fullPath: path,
    description: textAt(op, "summary") ?? textAt(op, "description") ?? "",
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

  for (const param of listAt(op, "parameters")) {
    const ref = textAt(param, "$ref");
    const resolved = ref ? resolveRef(spec, ref) : asNode(param);
    /* A reference into another file, or one this specification never
       defines, resolves to nothing — reading a name off it threw and took
       the whole import down. */
    const place = placeOf(resolved.in);
    if (typeof resolved.name !== "string" || place === undefined) continue;

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
    const shape = normalizeTypeArray(nodeAt(resolved, "schema") ?? resolved);
    const format = textAt(shape, "format");
    parameters.push({
      name,
      in: place,
      required: resolved.required === true,
      type: textAt(shape, "type") ?? "string",
      description: textAt(resolved, "description") ?? "",
      /* Reduced to a bare type name, a parameter lost the values it accepts
         and the element type of an array. */
      ...(shape.enum ? { enum: enumValues(listAt(shape, "enum")) } : {}),
      ...(format && { format }),
      ...(shape.items ? { items: convertSchemaInline(asNode(shape.items), spec) } : {}),
      ...(isStructured(shape) && { schema: convertSchemaInline(shape, spec) }),
      ...queryEncoding(resolved),
    });
  }
  return parameters;
}

/* How a query parameter is written, when not as OpenAPI's default: its own
   `style` and `explode`, or, for a Swagger 2.0 list, its `collectionFormat`
   — a Swagger 2.0 parameter carries its type itself, with no schema. */
function queryEncoding(param: SpecNode): Pick<ParsedParameter, "encoding"> {
  if (param.in !== "query") return {};
  const swaggerList = param.schema === undefined && param.type === "array";
  const encoding = swaggerList
    ? collectionEncoding(param.collectionFormat)
    : declaredEncoding(param.style, param.explode);
  return encoding && !isDefaultEncoding(encoding) ? { encoding } : {};
}

function placeOf(value: unknown): ParsedParameter["in"] | undefined {
  return value === "path" || value === "query" || value === "header" || value === "cookie"
    ? value
    : undefined;
}

/** Whether a parameter's schema is more than a type name and its values. */
function isStructured(shape: SpecNode): boolean {
  return Boolean(
    shape.oneOf || shape.anyOf || shape.allOf || shape.properties || shape.type === "object",
  );
}
