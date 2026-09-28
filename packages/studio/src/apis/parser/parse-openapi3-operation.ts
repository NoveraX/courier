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
  const body = parseRequestBody(op, spec);
  /* A HEAD answer never carries the body its GET would: a schema for it made
     every call fail validation on the null the client reads. */
  const responseSchema = method === "head" ? null : parseResponseSchema(op, spec);

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

function parseRequestBody(
  op: SpecNode,
  spec: SpecNode,
): Pick<ParsedEndpoint, "requestBody" | "requestBodyMediaType"> {
  if (!op.requestBody) return { requestBody: null };
  const body = op.requestBody.$ref ? resolveRef(spec, op.requestBody.$ref) : op.requestBody;
  /* Stripe sends every body as form-encoded and Twilio does the same; reading
     only `application/json` dropped all 594 and all 62 of them. Which of the
     two a body is sent as is kept beside its schema. */
  const media = firstSchemaIn(body?.content);
  if (media) {
    return {
      requestBody: convertSchemaInline(media.schema, spec),
      requestBodyMediaType: media.mediaType,
    };
  }
  /* Bytes are often sent with no schema at all; they are still a body. */
  const bytes = schemalessMediaType(body?.content);
  if (bytes === undefined) return { requestBody: null };
  return { requestBody: { name: "Body", type: "any" }, requestBodyMediaType: bytes };
}

/** Media types that carry a JSON schema, in the order worth preferring. */
function firstSchemaIn(
  content: SpecNode | undefined,
): { mediaType: string; schema: SpecNode } | undefined {
  if (!content || typeof content !== "object") return undefined;
  const preferred = content["application/json"]?.schema;
  if (preferred) return { mediaType: "application/json", schema: preferred };
  for (const [mediaType, media] of Object.entries(content)) {
    const schema = (media as SpecNode | undefined)?.schema;
    if (schema) return { mediaType, schema };
  }
  return undefined;
}

/** The first media type a body declares with no schema, unless it is JSON. */
function schemalessMediaType(content: SpecNode | undefined): string | undefined {
  if (!content || typeof content !== "object") return undefined;
  const [first] = Object.keys(content);
  return first === undefined || /json/i.test(first) ? undefined : first;
}

function parseResponseSchema(op: SpecNode, spec: SpecNode): ParsedSchema | null {
  const success = successResponse(op.responses);
  if (!success) return null;
  const resp = success.$ref ? resolveRef(spec, success.$ref) : success;
  const media = firstSchemaIn(resp?.content);
  return media ? convertSchemaInline(media.schema, spec) : null;
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
