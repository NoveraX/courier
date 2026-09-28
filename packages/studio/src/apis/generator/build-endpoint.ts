/**
 * Builds the builder chain describing each endpoint of a generated group.
 */

import { toInternalMethod } from "@noverax/courier";
import type { ParsedEndpoint, ParsedSchema } from "../parser/types";
import { convertPathParams } from "../parser/utils";
import { buildEndpointChain } from "./build-endpoint-helpers";
import { type EndpointContext, schemaConstant, typeName } from "./endpoint-context";
import { resolveResponseType, resolveVariablesType } from "./endpoint-types";
import { extendSchemaWithParams, getSchemaRefName } from "./schema-utils";

/**
 * The chain describing one endpoint.
 *
 * @param ep - The endpoint
 * @param context - The file it is written into, which records what the chain uses
 * @param extracted - The types extracted from the file's endpoints, by name
 * @returns The chain, from `endpoint` to its last slot
 * @example
 * ```ts
 * buildEndpointDefinition(getPet, context, {}); // 'endpoint.get(":petId").variables<{ petId: number }>().response(PetSchema)'
 * ```
 */
export function buildEndpointDefinition(
  ep: ParsedEndpoint,
  context: EndpointContext,
  extracted: Readonly<Record<string, ParsedSchema>> = {},
): string {
  const variables = variablesSchema(ep, context);
  const response = responseSchema(ep, context);
  return buildEndpointChain({
    address: address(ep),
    variablesSchema: variables,
    variablesType: variables
      ? null
      : (namedParams(ep, context, extracted) ?? resolveVariablesType(ep, context)),
    responseSchema: response,
    responseType: response ? "unknown" : resolveResponseType(ep, context),
  });
}

/**
 * Where the endpoint is, named by the verb that reaches it.
 *
 * An endpoint on a host of its own is addressed by its full URL, which the
 * client sends there whatever the group's prefix and the source's base.
 */
function address(ep: ParsedEndpoint): string {
  const method = toInternalMethod(ep.httpMethod);
  if (ep.origin) return `endpoint.${method}("${ep.origin}${convertPathParams(ep.fullPath)}")`;
  const path = ep.path === "/" ? "" : ep.path.replace(/^\//, "");
  return `endpoint.${method}("${path}")`;
}

/** The extracted type naming the endpoint's parameters, when there is one. */
function namedParams(
  ep: ParsedEndpoint,
  context: EndpointContext,
  extracted: Readonly<Record<string, ParsedSchema>>,
): string | null {
  const name = `${toPascalCase(ep.name)}Params`;
  return Object.hasOwn(extracted, name) ? typeName(context, name) : null;
}

function responseSchema(ep: ParsedEndpoint, context: EndpointContext): string | null {
  const ref = getSchemaRefName(ep.responseSchema);
  const constant = ref ? schemaConstant(context, ref) : null;
  return constant ? listOf(constant, ep.responseSchema, context) : null;
}

function variablesSchema(ep: ParsedEndpoint, context: EndpointContext): string | null {
  const ref = getSchemaRefName(ep.requestBody);
  const constant = ref ? schemaConstant(context, ref) : null;
  if (!ref || !constant) return null;

  const body = listOf(constant, ep.requestBody, context);
  const pathParams = ep.parameters.filter((p) => p.in === "path");
  if (pathParams.length === 0) return body;

  /* Only an object can be extended; a list or a set of alternatives has to be
     intersected with the path parameters instead. */
  const isObject = ep.requestBody?.type !== "array" && context.spec.schemas[ref]?.type !== "union";
  if (context.options.validation !== "arktype") context.uses.validator = true;
  return extendSchemaWithParams(
    body,
    pathParams.map((p) => p.name),
    context.options,
    isObject,
  );
}

/**
 * The validator for a named schema, wrapped when the payload is a list.
 *
 * A request body that is an array was expressed as the schema of one element,
 * so the validator rejected the very payload the endpoint requires.
 */
function listOf(constant: string, schema: ParsedSchema | null, context: EndpointContext): string {
  if (schema?.type !== "array") return constant;
  const { validation } = context.options;
  if (validation === "arktype") return `${constant}.array()`;
  context.uses.validator = true;
  return validation === "zod" ? `z.array(${constant})` : `v.array(${constant})`;
}

function toPascalCase(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
