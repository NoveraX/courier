/**
 * OpenAPI 3.x operation parser — converts a single path+method into ParsedEndpoint.
 */

import type { ParsedEndpoint, ParsedParameter, ParsedSchema, SpecNode } from "./types";
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

/** `200`, `204`, and the `2XX` wildcard in either case. */
const SUCCESS_CODE = /^2(?:\d\d|XX)$/i;

/** Statuses HTTP forbids a body, whatever the specification declares for them. */
const BODILESS_CODES = new Set(["204", "205"]);

/**
 * The response a caller gets on success.
 *
 * The lowest declared 2xx code is the one described, and the `2XX` wildcard
 * only when no code is named. `default` covers every status the operation
 * does not declare, so it describes success only when no 2xx is declared at
 * all: Box and DigitalOcean answer a delete with `204` beside a `default`
 * error, and reading the error as the success made every successful delete
 * fail validation.
 */
function successResponse(responses: SpecNode | undefined): SpecNode | undefined {
  if (!responses || typeof responses !== "object") return undefined;
  const [code] = Object.keys(responses)
    .filter((key) => SUCCESS_CODE.test(key) && responses[key])
    .sort();
  if (code === undefined) return responses.default || undefined;
  return BODILESS_CODES.has(code) ? undefined : responses[code];
}
