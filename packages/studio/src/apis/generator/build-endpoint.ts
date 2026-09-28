/**
 * Builds the builder chain describing each endpoint of a generated group.
 */

import { toInternalMethod } from "@noverax/courier";
import type { ParsedEndpoint, ParsedSchema } from "../parser/types";
import { convertPathParams } from "../parser/utils";
import { buildEndpointChain, emitsSchemas } from "./build-endpoint-helpers";
import {
  type EndpointContext,
  hasSchemaConstant,
  schemaConstant,
  typeName,
} from "./endpoint-context";
import { resolveResponseType, resolveVariablesType } from "./endpoint-types";
import { bodyKey, requestBodyKind } from "./request-body";
import { collectRefsDeep } from "./schema-refs";
import {
  extendSchemaWithParams,
  getSchemaRefName,
  objectWithBody,
  schemaToValidation,
} from "./schema-utils";
import { wireClosure } from "./wire-closure";

/**
 * The chain describing one endpoint.
 *
 * @param ep - The endpoint
 * @param context - The file it is written into, which records what the chain uses
 * @param paramsType - The type extracted for the endpoint's variables, if any
 * @returns The chain, from `endpoint` to its last slot
 * @example
 * ```ts
 * buildEndpointDefinition(getPet, context, undefined); // 'endpoint.get(":petId").variables<{ petId: number }>().response(PetSchema)'
 * ```
 */
export function buildEndpointDefinition(
  ep: ParsedEndpoint,
  context: EndpointContext,
  paramsType: string | undefined,
): string {
  const variables = variablesSchema(ep, context);
  const response = responseSchema(ep, context);
  const path = endpointPath(ep);
  return buildEndpointChain({
    address: `endpoint.${toInternalMethod(ep.httpMethod)}(${JSON.stringify(path)})`,
    closure: wireClosure(ep, path, requestBodyKind(ep, context.spec)),
    variablesSchema: variables,
    variablesType: variables
      ? null
      : ((paramsType ? typeName(context, paramsType) : null) ?? resolveVariablesType(ep, context)),
    responseSchema: response,
    responseType: response ? null : resolveResponseType(ep, context),
  });
}

/**
 * Where the endpoint is, as both its addressed form and its closure write it.
 *
 * An endpoint on a host of its own is addressed by its full URL, which the
 * client sends there whatever the group's prefix and the source's base.
 */
function endpointPath(ep: ParsedEndpoint): string {
  if (ep.origin) return `${ep.origin}${convertPathParams(ep.fullPath)}`;
  return ep.path === "/" ? "" : ep.path.replace(/^\//, "");
}

function responseSchema(ep: ParsedEndpoint, context: EndpointContext): string | null {
  const ref = getSchemaRefName(ep.responseSchema);
  const constant = ref ? schemaConstant(context, ref) : null;
  return constant ? listOf(constant, ep.responseSchema, context) : null;
}

/**
 * The schema validating what the endpoint is called with, when its body has
 * one: a named object's, extended with the parameters, or that of a list or
 * a scalar, beside them under its own key. A form, bytes and fields written
 * inline are typed without one.
 */
function variablesSchema(ep: ParsedEndpoint, context: EndpointContext): string | null {
  const kind = requestBodyKind(ep, context.spec);
  if (kind !== "fields" && kind !== "value") return null;
  const body = bodySchema(ep, context);
  if (!body) return null;

  /* The query parameters belong to the variables as much as the path's do:
     left out, zod and valibot stripped them before the call was made. */
  const params = (["path", "query"] as const).flatMap((place) =>
    ep.parameters.filter((param) => param.in === place),
  );
  if (params.length === 0) return body;
  context.uses.validator = true;
  if (kind === "value") return objectWithBody(body, params, bodyKey(ep), context.options);
  return extendSchemaWithParams(body, params, context.options, extendable(ep, context));
}

/** The body's own schema, when every schema it names is declared. */
function bodySchema(ep: ParsedEndpoint, context: EndpointContext): string | null {
  const ref = getSchemaRefName(ep.requestBody);
  if (ref) {
    const constant = schemaConstant(context, ref);
    return constant ? listOf(constant, ep.requestBody, context) : null;
  }
  const inline = ep.requestBody;
  if (!emitsSchemas(context.options) || !inline || inline.type === "object") return null;
  if (!bodyNamesDeclared(ep, context)) return null;
  context.uses.validator = true;
  return schemaToValidation(inline, context.options);
}

function bodyNamesDeclared(ep: ParsedEndpoint, context: EndpointContext): boolean {
  const names = new Set<string>();
  collectRefsDeep(ep.requestBody, names);
  if (![...names].every((name) => hasSchemaConstant(context, name))) return false;
  for (const name of names) schemaConstant(context, name);
  return true;
}

/**
 * Whether a named body's schema is an object that can be extended. One of
 * several shapes, or one written lazily because it is on a reference cycle,
 * is intersected with the parameters instead.
 */
function extendable(ep: ParsedEndpoint, context: EndpointContext): boolean {
  const ref = ep.requestBody?.refName;
  return (
    ref !== undefined && !context.lazy.has(ref) && context.spec.schemas[ref]?.type === "object"
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
