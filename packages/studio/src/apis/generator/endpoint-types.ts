/**
 * TypeScript types for an endpoint's variables and response.
 */

import { ownValue } from "../own-value";
import type { ParsedEndpoint, ParsedSchemaProperty } from "../parser/types";
import { type EndpointContext, endpointTypeStyle } from "./endpoint-context";
import { propertyType, schemaToTsType, type TypeStyle } from "./inline-types";
import { jsdocText } from "./jsdoc-text";
import { objectKey } from "./literals";
import { parameterProperty } from "./parameter-property";
import { bodyKey, requestBodyKind } from "./request-body";
import { variableParameters } from "./variable-parameters";

/**
 * The type an endpoint answers with.
 *
 * @param ep - The endpoint
 * @param context - The file it is written into
 * @returns The type, naming only what the file can import — `unknown` where
 *   nothing names it — or `null` for an endpoint that answers with nothing
 * @example
 * ```ts
 * resolveResponseType(listPets, context); // "Pet[]"
 * ```
 */
export function resolveResponseType(ep: ParsedEndpoint, context: EndpointContext): string | null {
  if (!ep.responseSchema) return null;
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
  const parts = variableParameters(ep).map((param) =>
    field(param.name, parameterProperty(param), context, style),
  );

  const kind = requestBodyKind(ep, context.spec);
  /* A form's entries fill the path, so the form is the whole of it. */
  if (kind === "form") return "FormData";
  if (kind === "value" || kind === "nested" || kind === "bytes") {
    const body = kind === "bytes" ? "Blob" : bodyType(ep, context, style);
    /* A body the operation does not require may be left out. */
    const optional = ep.requestBodyOptional === true;
    if (parts.length === 0) return optional ? `${body} | undefined` : body;
    const key = `${objectKey(bodyKey(ep))}${optional ? "?" : ""}`;
    return `{ ${[...parts, `${key}: ${body}${optional ? " | undefined" : ""}`].join("; ")} }`;
  }
  if (kind === "fields" && ep.requestBody?.type !== "object") {
    const body = bodyType(ep, context, style);
    const grouped = body.includes("|") ? `(${body})` : body;
    return parts.length > 0 ? `${grouped} & { ${parts.join("; ")} }` : body;
  }
  if (kind === "fields") parts.push(...fields(ep.requestBody?.properties ?? {}, context, style));

  return parts.length === 0 ? null : `{ ${parts.join("; ")} }`;
}

/**
 * The type of an endpoint's body. Without a types file there is no name to
 * refer to, so a named schema is written out where it is used.
 */
function bodyType(ep: ParsedEndpoint, context: EndpointContext, style: TypeStyle): string {
  const body = ep.requestBody;
  if (!body) return "undefined";
  if (context.options.generateTypes || body.type !== "ref" || !body.refName) {
    return schemaToTsType(body, style);
  }
  const target = ownValue(context.spec.schemas, body.refName);
  if (!target) return "unknown";
  if (target.type !== "object") return schemaToTsType(target, style);
  const parts = fields(target.properties ?? {}, context, style);
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
