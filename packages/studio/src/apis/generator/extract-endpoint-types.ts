/**
 * Extracts inline response/variable schemas from endpoints as named types.
 * Inline objects become named types in the schemas/types file.
 */

import { defineOwn } from "../define-own";
import { ownValue } from "../own-value";
import type {
  ParsedEndpoint,
  ParsedGroup,
  ParsedSchema,
  ParsedSchemaProperty,
} from "../parser/types";
import { bodyMedia } from "./body-media";
import type { ExtractedTypeNames } from "./extracted-type-names";
import { parameterProperty } from "./parameter-property";
import { bodyKey, sharesParameterName } from "./request-body";
import { headerParameters } from "./variable-parameters";

export interface ExtractedTypes {
  /** Modified group with response refs instead of inline schemas */
  group: ParsedGroup;
  /** Additional named schemas (response types + param types) */
  schemas: Record<string, ParsedSchema>;
  /** The type naming each endpoint's variables, by the endpoint's name. */
  params: Record<string, string>;
}

/**
 * Name the inline response objects and the variables of a group's
 * endpoints as types of their own.
 *
 * @param group - The group
 * @param names - The name each extracted type takes, decided over the whole import
 * @returns The group with its responses referring to the new types, and the types
 * @example
 * ```ts
 * const { group: processed, schemas } = extractEndpointTypes(group, names);
 * ```
 */
export function extractEndpointTypes(
  group: ParsedGroup,
  names: ExtractedTypeNames,
): ExtractedTypes {
  const schemas: Record<string, ParsedSchema> = {};
  const params: Record<string, string> = {};
  const endpoints: ParsedEndpoint[] = [];

  for (const ep of group.endpoints) {
    const response = responseToExtract(ep);
    const body = bodyToExtract(ep);
    const bodyName = body ? names.nameOf(group.name, ep.name, "Body") : undefined;
    if (body && bodyName) schemas[bodyName] = body;
    const variables = paramsToExtract(ep, bodyName);
    if (variables) {
      const name = names.nameOf(group.name, ep.name, "Params");
      schemas[name] = variables;
      params[ep.name] = name;
    }
    if (!response) {
      endpoints.push(ep);
      continue;
    }
    const name = names.nameOf(group.name, ep.name, "Response");
    schemas[name] = response;
    endpoints.push({ ...ep, responseSchema: { name, type: "ref", refName: name } });
  }

  return { group: { ...group, endpoints }, schemas, params };
}

/**
 * An endpoint's response, when it is an object written inline — or a list
 * of them, or one of several shapes — and so gets a type of its own.
 *
 * @param ep - The endpoint
 * @returns The response's schema, or `null` when it stays as it is
 * @example
 * ```ts
 * responseToExtract(listItems); // { type: "object", properties: { total, items } }
 * ```
 */
export function responseToExtract(ep: ParsedEndpoint): ParsedSchema | null {
  const schema = ep.responseSchema;
  if (!schema || schema.type === "ref") return null;
  if (schema.type === "object")
    return Object.keys(schema.properties ?? {}).length > 0 ? schema : null;
  if (schema.type === "array" && schema.items?.type === "object" && schema.items.properties) {
    return schema;
  }
  /* A response that is one of several shapes — a list or `null`, say — is
     only validated through a named schema; written inline it was a type the
     answer was never checked against. */
  return schema.type === "union" && (schema.variants?.length ?? 0) > 0 ? schema : null;
}

/**
 * The type of what an endpoint is called with, when it gets one of its own:
 * its path and query parameters, and the fields of a body written inline
 * beside them. A body's fields always get one, so the schema that checks
 * them before the call is made has a type to name; a parameter or two alone
 * stay written where they are used.
 *
 * The body's fields are part of it, so an endpoint whose parameters are named
 * this way is still called with the body it requires.
 *
 * @param ep - The endpoint
 * @returns The variables' schema, or `null` when they are written where they are used
 * @example
 * ```ts
 * paramsToExtract(findPets)?.properties; // { status, tags }
 * ```
 */
export function paramsToExtract(ep: ParsedEndpoint, bodyName?: string): ParsedSchema | null {
  /* A body that is not an object's fields written inline — a named schema,
     a list, a form, bytes — sits beside the parameters in its own way. */
  if (ep.requestBody && !inlineFields(ep)) return null;
  /* Its path and query parameters as declared, then its headers. */
  const params = [
    ...ep.parameters.filter((p) => p.in === "path" || p.in === "query"),
    ...headerParameters(ep),
  ];
  const nested = bodyToExtract(ep);
  /* Past the check above, a body is an object's fields written inline. */
  const bodyFields = Boolean(ep.requestBody);
  if (params.length < 2 && !params.some((p) => p.description) && !nested && !bodyFields) {
    return null;
  }

  /* Every key defined as its own: a parameter or a field named `__proto__` is one too. */
  const properties: Record<string, ParsedSchemaProperty> = {};
  for (const param of params) defineOwn(properties, param.name, parameterProperty(param));
  if (nested) {
    const required = ep.requestBodyOptional !== true;
    defineOwn(
      properties,
      bodyKey(ep),
      bodyName
        ? { type: "ref", refName: bodyName, required }
        : { type: "object", required, shape: nested },
    );
  } else {
    const fields = ep.requestBody?.properties ?? {};
    for (const [name, prop] of Object.entries(fields)) if (name) defineOwn(properties, name, prop);
  }

  const required = Object.keys(properties).filter((name) => ownValue(properties, name)?.required);
  return { name: "", type: "object", properties, required };
}

/**
 * An endpoint's body, when it is fields written inline of which one shares a
 * parameter's name: passed under a key of its own, it is described by a type
 * of its own, field by field.
 *
 * @param ep - The endpoint
 * @returns The body's schema, or `null` when it stays as it is
 * @example
 * ```ts
 * bodyToExtract(createOrgForUser); // { type: "object", properties: { username, full_name } }
 * ```
 */
export function bodyToExtract(ep: ParsedEndpoint): ParsedSchema | null {
  if (!ep.requestBody || !inlineFields(ep)) return null;
  return sharesParameterName(ep, Object.keys(ep.requestBody.properties ?? {}))
    ? ep.requestBody
    : null;
}

/** Whether the body is JSON fields written inline in the specification. */
function inlineFields(ep: ParsedEndpoint): boolean {
  const body = ep.requestBody;
  if (body?.type !== "object" || Object.keys(body.properties ?? {}).length === 0) return false;
  return bodyMedia(ep) === "structured";
}
