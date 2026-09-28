/**
 * Swagger 2.0 specification parser.
 * Converts to OpenAPI 3.x-like structure, then delegates to parseOpenApi3.
 *
 * The conversion has to carry everything a reference can point at. Dropping
 * the shared `parameters` section left every `#/parameters/...` pointing at
 * nothing, which is how Kubernetes' specification used to end the import.
 */

import { isOperationKey } from "./http-methods";
import { parseOpenApi3 } from "./parse-openapi3";
import type { ParsedSpec, SpecNode } from "./types";

export function parseSwagger2(spec: SpecNode): ParsedSpec {
  const converted: SpecNode = {
    openapi: "3.0.0",
    info: spec.info,
    servers: [{ url: serverUrl(spec) }],
    paths: {},
    components: { schemas: spec.definitions ?? {} },
    /* A Swagger 2.0 pointer names the section at the document root, so the
       sections stay where the pointer expects to find them. */
    definitions: spec.definitions ?? {},
    parameters: spec.parameters ?? {},
    responses: spec.responses ?? {},
    /* Read by the security-scheme parser, which understands both spellings. */
    securityDefinitions: spec.securityDefinitions ?? {},
    ...(spec.security && { security: spec.security }),
    ...(spec.tags && { tags: spec.tags }),
  };

  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    if (!methods || typeof methods !== "object") continue;
    const item = methods as SpecNode;

    converted.paths[path] = {};
    /* Applies to every operation under this path item. */
    if (Array.isArray(item.parameters)) {
      converted.paths[path].parameters = item.parameters;
    }

    for (const [method, operation] of Object.entries(item)) {
      if (!isOperationKey(method)) continue;
      if (!operation || typeof operation !== "object") continue;

      const op = { ...(operation as SpecNode) };
      convertBody(op, spec);
      convertResponses(op, spec);
      converted.paths[path][method] = op;
    }
  }

  const result = parseOpenApi3(converted);
  result.format = "swagger2" as ParsedSpec["format"];
  return result;
}

/**
 * Where the API actually lives.
 *
 * Swagger 2.0 splits the address across `schemes`, `host` and `basePath`;
 * reading only `basePath` produced a relative URL pointing at the caller's own
 * origin.
 */
function serverUrl(spec: SpecNode): string {
  const basePath = typeof spec.basePath === "string" ? spec.basePath : "";
  if (typeof spec.host !== "string" || spec.host === "") return basePath || "/";
  const scheme = Array.isArray(spec.schemes) && spec.schemes.length > 0 ? spec.schemes[0] : "https";
  return `${scheme}://${spec.host}${basePath}`;
}

/** Body and formData parameters become a request body. */
function convertBody(op: SpecNode, spec: SpecNode): void {
  const parameters: SpecNode[] = Array.isArray(op.parameters) ? op.parameters : [];
  const body = parameters.find((p) => p?.in === "body");

  if (body) {
    op.requestBody = { content: { [bodyMediaType(op, spec)]: { schema: body.schema } } };
    op.parameters = parameters.filter((p) => p?.in !== "body");
    return;
  }

  const formFields = parameters.filter((p) => p?.in === "formData");
  if (formFields.length === 0) return;

  /* A form body is a set of named fields; without this they vanished from the
     generated client entirely. */
  const properties: SpecNode = {};
  const required: string[] = [];
  for (const field of formFields) {
    if (typeof field.name !== "string") continue;
    properties[field.name] = {
      type: field.type === "file" ? "string" : (field.type ?? "string"),
      ...(field.type === "file" ? { format: "binary" } : field.format && { format: field.format }),
      ...(field.enum && { enum: field.enum }),
      ...(field.description && { description: field.description }),
    };
    if (field.required) required.push(field.name);
  }

  op.requestBody = {
    content: {
      [formMediaType(op, spec, formFields)]: {
        schema: { type: "object", properties, required },
      },
    },
  };
  op.parameters = parameters.filter((p) => p?.in !== "formData");
}

function consumesOf(op: SpecNode, spec: SpecNode): unknown[] {
  const consumes = Array.isArray(op.consumes) ? op.consumes : spec.consumes;
  return Array.isArray(consumes) ? consumes : [];
}

function bodyMediaType(op: SpecNode, spec: SpecNode): string {
  const [first] = consumesOf(op, spec);
  return typeof first === "string" ? first : "application/json";
}

const URLENCODED = "application/x-www-form-urlencoded";
const MULTIPART = "multipart/form-data";

/**
 * The media type a form is sent as.
 *
 * Swagger 2.0 sends form fields url-encoded or as multipart, and a form that
 * uploads a file only as multipart. Taking the first type `consumes` lists
 * called a form described beside `application/json` a JSON body, and a form
 * whose operation lists nothing was taken for JSON too.
 */
function formMediaType(op: SpecNode, spec: SpecNode, fields: SpecNode[]): string {
  if (fields.some((field) => field?.type === "file")) return MULTIPART;
  const declared = consumesOf(op, spec).find((type) => type === URLENCODED || type === MULTIPART);
  return typeof declared === "string" ? declared : URLENCODED;
}

/** Swagger 2.0 puts a response schema directly on the response. */
function convertResponses(op: SpecNode, spec: SpecNode): void {
  if (!op.responses || typeof op.responses !== "object") return;
  const produces = Array.isArray(op.produces) ? op.produces : spec.produces;
  const mediaType =
    Array.isArray(produces) && typeof produces[0] === "string" ? produces[0] : "application/json";

  for (const [code, response] of Object.entries(op.responses)) {
    const resp = response as SpecNode;
    if (!resp?.schema) continue;
    op.responses[code] = {
      description: resp.description,
      content: { [mediaType]: { schema: resp.schema } },
    };
  }
}
