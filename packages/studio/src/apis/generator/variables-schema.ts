import type { ParsedEndpoint, ParsedParameter, ParsedSchema } from "../parser/types";
import { emitsSchemas } from "./build-endpoint-helpers";
import { constantsDeclared, declaredSchema } from "./declared-schema";
import { type EndpointContext, schemaConstant } from "./endpoint-context";
import {
  extendSchemaWithParams,
  objectWithBody,
  optionalSchema,
  parametersSchema,
} from "./parameter-schemas";
import { parametersNeedChecks } from "./parameters-need-checks";
import { bodyKey, requestBodyKind } from "./request-body";
import { variableParameters } from "./variable-parameters";

/**
 * The schema validating what the endpoint is called with, when its body has
 * one: a named object's, extended with the parameters, or that of a list, a
 * scalar or fields sharing a parameter's name, beside them under its own
 * key; for fields written inline, the schema extracted with their type. A
 * form and bytes are typed without one.
 *
 * @param ep - The endpoint
 * @param context - The file it is written into, which records what it uses
 * @param paramsType - The type extracted for the endpoint's variables, if any
 * @returns The schema's source, or `null` when the variables have none
 * @example
 * ```ts
 * variablesSchema(bulkTag, context, undefined); // "z.object({ item_id: z.number(), body: z.array(TagSchema) })"
 * ```
 */
export function variablesSchema(
  ep: ParsedEndpoint,
  context: EndpointContext,
  paramsType: string | undefined,
): string | null {
  const kind = requestBodyKind(ep, context.spec);
  if (kind === "none") return checkedParameters(ep, context);
  if (kind !== "fields" && kind !== "value" && kind !== "nested") return null;
  const body = bodySchema(ep, context);
  if (!body) return inlineFieldsSchema(ep, kind, paramsType, context);

  /* The query parameters belong to the variables as much as the path's do:
     left out, zod and valibot stripped them before the call was made. */
  const params = variableParameters(ep);
  /* A list, a scalar or a map the operation does not require may be left out. */
  const optional = kind !== "fields" && ep.requestBodyOptional === true;
  if (params.length === 0 && !optional) return body;
  /* A parameter's schema may name others, whose constants the file imports. */
  if (!constantsDeclared(params.flatMap(parameterSchemas), context)) return null;
  context.uses.validator = true;
  if (params.length === 0) return optionalSchema(body, context.options);
  if (kind !== "fields") {
    return objectWithBody(body, params, bodyKey(ep), context.options, optional);
  }
  return extendSchemaWithParams(body, params, context.options, extendable(ep, context));
}

/* Parameters alone are typed rather than validated, unless one is
   constrained beyond what its type can say: only a schema checks that. */
function checkedParameters(ep: ParsedEndpoint, context: EndpointContext): string | null {
  const params = variableParameters(ep);
  if (!emitsSchemas(context.options)) return null;
  if (!parametersNeedChecks(params, context.spec.schemas)) return null;
  if (!constantsDeclared(params.flatMap(parameterSchemas), context)) return null;
  context.uses.validator = true;
  return parametersSchema(params, context.options);
}

/* Fields written inline are extracted as a type of their own, with the
   parameters, and a schema beside it; left unused, a call with them was
   never validated, though one with a named body was. */
function inlineFieldsSchema(
  ep: ParsedEndpoint,
  kind: ReturnType<typeof requestBodyKind>,
  paramsType: string | undefined,
  context: EndpointContext,
): string | null {
  if (kind !== "fields" || !paramsType || ep.requestBody?.refName) return null;
  return schemaConstant(context, paramsType);
}

/** The body's own schema, when every schema it names is declared. */
function bodySchema(ep: ParsedEndpoint, context: EndpointContext): string | null {
  return declaredSchema(ep.requestBody, context);
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

function parameterSchemas(param: ParsedParameter): Array<ParsedSchema | undefined> {
  return [param.schema, param.items];
}
