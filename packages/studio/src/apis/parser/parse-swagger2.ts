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
import { fieldOf, isNode, listAt, nodeAt, type SpecNode } from "./spec-node";
import { withFormBody } from "./swagger2-form-body";
import { bodyMediaType } from "./swagger2-media-types";
import type { ParsedSpec } from "./types";

export function parseSwagger2(spec: SpecNode): ParsedSpec {
  const definitions = nodeAt(spec, "definitions") ?? {};
  const converted: SpecNode = {
    openapi: "3.0.0",
    info: spec.info,
    servers: [{ url: serverUrl(spec) }],
    paths: convertPaths(spec),
    components: { schemas: definitions },
    /* A Swagger 2.0 pointer names the section at the document root, so the
       sections stay where the pointer expects to find them. */
    definitions,
    parameters: nodeAt(spec, "parameters") ?? {},
    responses: nodeAt(spec, "responses") ?? {},
    /* Read by the security-scheme parser, which understands both spellings. */
    securityDefinitions: nodeAt(spec, "securityDefinitions") ?? {},
    ...(spec.security ? { security: spec.security } : {}),
    ...(spec.tags ? { tags: spec.tags } : {}),
  };

  return { ...parseOpenApi3(converted), format: "swagger2" };
}

function convertPaths(spec: SpecNode): SpecNode {
  const paths: Record<string, SpecNode> = {};
  for (const [path, item] of Object.entries(nodeAt(spec, "paths") ?? {})) {
    if (!isNode(item)) continue;
    const converted: Record<string, unknown> = {};
    /* Applies to every operation under this path item. */
    const shared = fieldOf(item, "parameters");
    if (Array.isArray(shared)) converted.parameters = shared;
    for (const [method, operation] of Object.entries(item)) {
      if (!isOperationKey(method) || !isNode(operation)) continue;
      converted[method] = withResponses(withBody(operation, spec), spec);
    }
    paths[path] = converted;
  }
  return paths;
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
  const [first] = listAt(spec, "schemes");
  const scheme = typeof first === "string" ? first : "https";
  return `${scheme}://${spec.host}${basePath}`;
}

/** Body and formData parameters become a request body. */
function withBody(op: SpecNode, spec: SpecNode): SpecNode {
  const parameters = listAt(op, "parameters");
  const body = parameters.find((p) => fieldOf(p, "in") === "body");
  if (!body) return withFormBody(op, spec, parameters) ?? op;
  const content = { [bodyMediaType(op, spec)]: { schema: fieldOf(body, "schema") } };
  return {
    ...op,
    requestBody: { content },
    parameters: parameters.filter((p) => fieldOf(p, "in") !== "body"),
  };
}

/** Swagger 2.0 puts a response schema directly on the response. */
function withResponses(op: SpecNode, spec: SpecNode): SpecNode {
  const responses = nodeAt(op, "responses");
  if (!responses) return op;
  const own = fieldOf(op, "produces");
  const [first] = Array.isArray(own) ? own : listAt(spec, "produces");
  const mediaType = typeof first === "string" ? first : "application/json";

  const converted: Record<string, unknown> = {};
  for (const [code, response] of Object.entries(responses)) {
    const schema = fieldOf(response, "schema");
    converted[code] = schema
      ? { description: fieldOf(response, "description"), content: { [mediaType]: { schema } } }
      : response;
  }
  return { ...op, responses: converted };
}
