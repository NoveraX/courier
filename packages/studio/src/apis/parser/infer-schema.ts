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
    const entries: Array<[string, unknown]> = Object.entries(value);
    for (const [key, val] of entries) {
      /* A nested object or array has a shape of its own: a list is typed by
         its first element, an object by its own fields. */
      const nested = `${name}${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      properties[key] = {
        type: propertyType(val),
        required: true,
        ...(Array.isArray(val) &&
          val.length > 0 && { items: inferSchemaFromValue(`${nested}Item`, val[0]) }),
        ...(isFields(val) && { shape: inferSchemaFromValue(nested, val) }),
      };
    }
    return { name, type: "object", properties, required: Object.keys(properties) };
  }

  return { name, type: propertyType(value) };
}

/** The parsed-schema type name for a JSON value. */
function propertyType(value: unknown): ParsedSchema["type"] {
  if (Array.isArray(value)) return "array";
  if (value === null) return "any";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  return "string";
}

function isFields(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
