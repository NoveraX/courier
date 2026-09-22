/**
 * Infer ParsedSchema from runtime JavaScript values (Postman/HAR imports).
 */

import type { ParsedSchema, ParsedSchemaProperty } from "./types";

export function inferSchemaFromValue(name: string, value: unknown): ParsedSchema {
  if (Array.isArray(value)) {
    return {
      name,
      type: "array",
      items: value.length > 0 ? inferSchemaFromValue(`${name}Item`, value[0]) : undefined,
    };
  }

  if (value !== null && typeof value === "object") {
    const properties: Record<string, ParsedSchemaProperty> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      /* A nested object or array has a shape of its own; calling all of them
         `string` described the body as something it is not. */
      properties[key] = {
        type: propertyType(val),
        required: true,
        items:
          Array.isArray(val) || (val !== null && typeof val === "object")
            ? inferSchemaFromValue(`${name}${key.charAt(0).toUpperCase()}${key.slice(1)}`, val)
            : undefined,
      };
    }
    return { name, type: "object", properties, required: Object.keys(properties) };
  }

  return { name, type: typeof value as ParsedSchema["type"] };
}

/** The parsed-schema type name for a JSON value. */
function propertyType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "any";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "string";
}
