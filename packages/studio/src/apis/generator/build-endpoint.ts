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
import { isEventStream, type ResponseReading, responseReading } from "./response-reading";
import { collectRefsDeep } from "./schema-refs";
import {
  extendSchemaWithParams,
  getSchemaRefName,
  objectWithBody,
  schemaToValidation,
} from "./schema-utils";
import { hasStyledQuery } from "./styled-query";
import { sendsUrlEncoded, wireClosure } from "./wire-closure";

/** The validators whose generated objects are loose. */
const LOOSE: ReadonlySet<string> = new Set(["zod", "valibot"]);

/** The type of an answer read otherwise than as JSON. */
const READ_TYPES: Readonly<Record<ResponseReading, string | undefined>> = {
  json: undefined,
  text: "string",
  blob: "Blob",
};

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
  /* An answer that is not JSON is typed as what it is read as, and not
     validated: a schema describes JSON. */
  const reading = responseReading(ep);
  const response = reading === "json" ? responseSchema(ep, context) : null;
  const path = endpointPath(ep);
  /* The objects zod and valibot are generated with keep undeclared fields,
     and their inferred types gain an index signature; with types generated,
     a slot says the declared type beside its schema. */
  const declared = context.options.generateTypes && LOOSE.has(context.options.validation);
  const kind = requestBodyKind(ep, context.spec);
  if (sendsUrlEncoded(ep, kind)) context.uses.formBody = true;
  const closure = wireClosure(ep, path, kind, reading);
  if (closure !== null && hasStyledQuery(ep)) context.uses.formQuery = true;
  /* A stream of events is subscribed to, and its answer is each event. */
  const head = isEventStream(ep) && closure === null ? "stream" : "endpoint";
  context.uses.bases.add(head);
  return buildEndpointChain({
    address: `${head}.${toInternalMethod(ep.httpMethod)}(${JSON.stringify(path)})`,
    closure,
    variablesSchema: variables,
    variablesType:
      variables && !declared
        ? null
        : ((paramsType ? typeName(context, paramsType) : null) ??
          resolveVariablesType(ep, context)),
    responseSchema: response,
    responseType:
      response && !declared ? null : (READ_TYPES[reading] ?? resolveResponseType(ep, context)),
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
  return declaredSchema(ep.responseSchema, context);
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
  return declaredSchema(ep.requestBody, context);
}

/* A named schema's constant; or, written inline, a schema that is not an
   object with fields — a string, a list, a map — so a body or an answer of
   one is validated, and a mock can make one up. An inline object with
   fields has a type of its own instead. */
function declaredSchema(schema: ParsedSchema | null, context: EndpointContext): string | null {
  const ref = getSchemaRefName(schema);
  if (ref) {
    const constant = schemaConstant(context, ref);
    return constant ? listOf(constant, schema, context) : null;
  }
  if (!emitsSchemas(context.options) || !schema || hasFields(schema)) return null;
  if (!namesDeclared(schema, context)) return null;
  context.uses.validator = true;
  return schemaToValidation(schema, context.options);
}

/* An object with fields; a map, which has none, is written as a record. */
function hasFields(schema: ParsedSchema): boolean {
  return schema.type === "object" && Object.keys(schema.properties ?? {}).length > 0;
}

function namesDeclared(schema: ParsedSchema, context: EndpointContext): boolean {
  const names = new Set<string>();
  collectRefsDeep(schema, names);
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
