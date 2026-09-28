/**
 * The schema of a request or a response body, converted where it stands.
 */

import { toSafeIdentifier } from "./naming-utils";
import { acceptsNull, orNull, stripNull } from "./nullable-schema";
import { componentSchemaName } from "./ref-utils";
import { convertSchema, normalizeTypeArray, schemaTypeOf } from "./schema-conversion";
import { asNode, type SpecNode, textAt } from "./spec-node";
import type { ParsedSchema } from "./types";

/**
 * Convert the schema of a request or a response body.
 *
 * A reference stays a reference and a list of references a list of them;
 * anything else is converted where it stands. OpenAPI 3.1's type arrays are
 * read here too: `["array", "null"]` used to be taken for a type name, which
 * left the response untyped, and `["object", "null"]` lost the `null`. An
 * `allOf` is merged with the components it references; converted without
 * the specification, it kept only its own properties, and the validator
 * then stripped every inherited one off the answer.
 *
 * @param raw - The body's schema as written in the specification
 * @param spec - The whole specification, for resolving references
 * @returns The parsed schema
 * @example
 * ```ts
 * convertSchemaInline({ type: ["array", "null"], items: { $ref: "#/c/s/Node" } }, spec);
 * // → { type: "union", variants: [{ type: "array", items: ref Node }, null] }
 * ```
 */
export function convertSchemaInline(raw: SpecNode, spec: SpecNode): ParsedSchema {
  const schema = normalizeTypeArray(raw);
  if (acceptsNull(schema)) return orNull(convertSchemaInline(stripNull(schema), spec));
  const ref = textAt(schema, "$ref");
  if (ref !== undefined) {
    const component = componentSchemaName(ref);
    if (component === undefined) return convertSchema("Inline", schema, spec);
    const refName = toSafeIdentifier(component);
    return { name: refName, type: "ref", refName };
  }
  if (schema.allOf || schema.oneOf || schema.anyOf) return convertSchema("Inline", schema, spec);
  const type = textAt(schema, "type");
  if (type === "array" && schema.items) {
    return { name: "Array", type: "array", items: convertSchemaInline(asNode(schema.items), spec) };
  }
  if (type === "object" || schema.properties) return convertSchema("Inline", schema, spec);
  const known = schemaTypeOf(type);
  return { name: known, type: known };
}
