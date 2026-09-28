/**
 * TypeScript types for an endpoint's variables and response.
 */

import type { ParsedEndpoint, ParsedParameter } from "../parser/types";
import { type EndpointContext, endpointTypeStyle } from "./endpoint-context";
import { typeUnion } from "./enum-literals";
import { schemaToTsType, type TypeStyle } from "./inline-types";
import { jsdocText } from "./jsdoc-text";
import { objectKey } from "./literals";

function tsType(type: string): string {
  if (type === "ref") return "unknown";
  if (type === "integer") return "number";
  if (type === "array") return "unknown[]";
  if (["string", "number", "boolean", "null"].includes(type)) return type;
  return "unknown";
}

/**
 * The type an endpoint answers with.
 *
 * @param ep - The endpoint
 * @param context - The file it is written into
 * @returns The type, naming only what the file can import; `unknown` without a schema
 * @example
 * ```ts
 * resolveResponseType(listPets, context); // "Pet[]"
 * ```
 */
export function resolveResponseType(ep: ParsedEndpoint, context: EndpointContext): string {
  if (!ep.responseSchema) return "unknown";
  return schemaToTsType(ep.responseSchema, endpointTypeStyle(context));
}

/**
 * The type of what an endpoint is called with, for a chain that has no
 * schema to take it from.
 *
 * @param ep - The endpoint
 * @param context - The file it is written into
 * @returns The type, or `null` when the endpoint takes nothing
 * @example
 * ```ts
 * resolveVariablesType(getPet, context); // "{ petId: number }"
 * ```
 */
export function resolveVariablesType(ep: ParsedEndpoint, context: EndpointContext): string | null {
  const style = endpointTypeStyle(context);
  const parts = parameterFields(ep, context, style);

  if (ep.requestBody?.type === "ref" && ep.requestBody.refName) {
    /* Without a types file there is no name to refer to, so the body's shape
       is written out where it is used. */
    const body = context.options.generateTypes
      ? schemaToTsType(ep.requestBody, style)
      : inlineShape(context, ep.requestBody.refName);
    return parts.length > 0 ? `${body} & { ${parts.join("; ")} }` : body;
  }

  if (ep.requestBody?.type === "object" && ep.requestBody.properties) {
    for (const [name, prop] of Object.entries(ep.requestBody.properties)) {
      if (!name) continue;
      parts.push(`${objectKey(name)}${prop.required ? "" : "?"}: ${tsType(prop.type)}`);
    }
  }

  return parts.length === 0 ? null : `{ ${parts.join("; ")} }`;
}

/** The path parameters, then the query parameters, each as a field. */
function parameterFields(ep: ParsedEndpoint, context: EndpointContext, style: TypeStyle): string[] {
  const fields: string[] = [];
  for (const place of ["path", "query"] as const) {
    for (const param of ep.parameters.filter((p) => p.in === place)) {
      const optional = place === "query" && !param.required ? "?" : "";
      const doc =
        context.options.includeComments && param.description
          ? `/** ${jsdocText(param.description)} */ `
          : "";
      fields.push(`${doc}${objectKey(param.name)}${optional}: ${parameterTsType(param, style)}`);
    }
  }
  return fields;
}

/**
 * Write a referenced schema out as an object type.
 *
 * Used where no types file is generated, so there is no name to refer to.
 */
function inlineShape(context: EndpointContext, refName: string): string {
  const schema = context.spec.schemas[refName];
  if (!schema?.properties) return "Record<string, unknown>";

  const parts: string[] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    if (!name) continue;
    const optional = prop.required ? "" : "?";
    const doc =
      context.options.includeComments && prop.description
        ? `/** ${jsdocText(prop.description)} */ `
        : "";
    parts.push(`${doc}${objectKey(name)}${optional}: ${tsType(prop.type)}`);
  }
  return parts.length > 0 ? `{ ${parts.join("; ")} }` : "Record<string, unknown>";
}

/**
 * The type a parameter accepts.
 *
 * Reduced to a bare type name, a parameter lost the values it allows and the
 * element type of an array — every `status` that accepts three words was
 * typed `string`, and every repeated query value was typed as one.
 */
function parameterTsType(param: ParsedParameter, style: TypeStyle): string {
  if (param.enum?.length) return typeUnion(param.enum);
  if (param.type === "array") {
    const item = param.items ? schemaToTsType(param.items, style) : "string";
    return item.includes("|") ? `(${item})[]` : `${item}[]`;
  }
  return tsType(param.type);
}
