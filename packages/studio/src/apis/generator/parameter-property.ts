/**
 * A parameter as a property of the object an endpoint is called with.
 */

import type { ParsedParameter, ParsedSchemaProperty } from "../parser/types";

/**
 * Describe a parameter the way a property of an object is described, so a
 * type or a schema is written for it exactly as for a body's field.
 *
 * Copying only its type name lost the values it allows, the element type of
 * a list and the forms a composite one takes: every `status` accepting three
 * words was typed `string`, and a repeated query value `unknown`.
 *
 * @param param - The parameter
 * @returns The property; a path parameter is always required
 * @example
 * ```ts
 * parameterProperty({ name: "status", in: "query", required: true, type: "string", description: "", enum: ["a", "b"] });
 * // → { type: "string", required: true, enum: ["a", "b"] }
 * ```
 */
export function parameterProperty(param: ParsedParameter): ParsedSchemaProperty {
  return {
    type: param.type,
    required: param.required || param.in === "path",
    ...(param.description && { description: param.description }),
    ...(param.enum?.length && { enum: param.enum }),
    /* A list without a declared element is a list of the text a query
       string carries. */
    ...(param.type === "array" && { items: param.items ?? { name: "", type: "string" } }),
    ...(param.schema && { shape: param.schema }),
  };
}
