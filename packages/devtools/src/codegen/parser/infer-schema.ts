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
      properties[key] = {
        type: typeof val === "number" ? "number" : typeof val === "boolean" ? "boolean" : "string",
        required: true,
      };
    }
    return { name, type: "object", properties, required: Object.keys(properties) };
  }

  return { name, type: typeof value as ParsedSchema["type"] };
}
