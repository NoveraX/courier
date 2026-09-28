/**
 * TypeScript types for an endpoint's variables and response.
 */

import type { ParsedEndpoint, ParsedSchemaProperty } from "../parser/types";
import { type EndpointContext, endpointTypeStyle } from "./endpoint-context";
import { propertyType, schemaToTsType, type TypeStyle } from "./inline-types";
import { jsdocText } from "./jsdoc-text";
import { objectKey } from "./literals";
import { parameterProperty } from "./parameter-property";

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
  const parts = (["path", "query"] as const).flatMap((place) =>
    ep.parameters
      .filter((param) => param.in === place)
      .map((param) => field(param.name, parameterProperty(param), context, style)),
  );

  if (ep.requestBody?.type === "ref" && ep.requestBody.refName) {
    /* Without a types file there is no name to refer to, so the body's shape
       is written out where it is used. */
    const body = context.options.generateTypes
      ? schemaToTsType(ep.requestBody, style)
      : inlineShape(context, ep.requestBody.refName, style);
    return parts.length > 0 ? `${body} & { ${parts.join("; ")} }` : body;
  }

  if (ep.requestBody?.type === "object" && ep.requestBody.properties) {
    parts.push(...fields(ep.requestBody.properties, context, style));
  }

  return parts.length === 0 ? null : `{ ${parts.join("; ")} }`;
}

/**
 * Write a referenced schema out as an object type.
 *
 * Used where no types file is generated, so there is no name to refer to.
 */
function inlineShape(context: EndpointContext, refName: string, style: TypeStyle): string {
  const properties = context.spec.schemas[refName]?.properties ?? {};
  const parts = fields(properties, context, style);
  return parts.length > 0 ? `{ ${parts.join("; ")} }` : "Record<string, unknown>";
}

function fields(
  properties: Readonly<Record<string, ParsedSchemaProperty>>,
  context: EndpointContext,
  style: TypeStyle,
): string[] {
  return Object.entries(properties)
    .filter(([name]) => name !== "")
    .map(([name, prop]) => field(name, prop, context, style));
}

/**
 * One field of the variables, written with the whole of its type: the
 * values it allows, the element of a list, the fields of an object. Reduced
 * to a type name, a list of labels was typed `unknown[]` and an inline object
 * `unknown`.
 */
function field(
  name: string,
  prop: ParsedSchemaProperty,
  context: EndpointContext,
  style: TypeStyle,
): string {
  const doc =
    context.options.includeComments && prop.description
      ? `/** ${jsdocText(prop.description)} */ `
      : "";
  return `${doc}${objectKey(name)}${propertyType(prop, !prop.required, style)}`;
}
