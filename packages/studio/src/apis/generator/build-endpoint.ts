/**
 * Builds the builder chain describing each endpoint of a generated group.
 */

import { toInternalMethod } from "@noverax/courier/internal";
import type { ParsedEndpoint } from "../parser/types";
import { convertPathParams } from "../parser/utils";
import { buildEndpointChain } from "./build-endpoint-helpers";
import { declaredSchema } from "./declared-schema";
import { type EndpointContext, typeName } from "./endpoint-context";
import { resolveResponseType, resolveVariablesType } from "./endpoint-types";
import { requestBodyKind } from "./request-body";
import { isEventStream, type ResponseReading, responseReading } from "./response-reading";
import { hasStyledQuery } from "./styled-query";
import { headerParameters } from "./variable-parameters";
import { variablesSchema } from "./variables-schema";
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
  const variables = variablesSchema(ep, context, paramsType);
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
  /* A stream's only closure is one opening it, so it stays a stream. */
  const head = isEventStream(ep) ? "stream" : "endpoint";
  context.uses.bases.add(head);
  const headers = headerParameters(ep).map((param) => param.name);
  if (headers.length > 0) context.uses.headerVariables = true;
  return buildEndpointChain({
    head,
    address: `${head}.${toInternalMethod(ep.httpMethod)}(${JSON.stringify(path)})`,
    closure,
    headers,
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
