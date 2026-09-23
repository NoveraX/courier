/**
 * Converts OpenAPI object schemas with properties into ParsedSchema.
 */

import { convertProperty, mapValueType } from "./convert-property";
import type { ParsedSchema, ParsedSchemaProperty, SpecNode } from "./types";

export function convertObjectSchema(name: string, schema: SpecNode, spec?: SpecNode): ParsedSchema {
  const properties = extractProperties(schema, spec);
  const requiredFields = new Set(schema.required ?? []);

  return {
    name,
    type: "object",
    properties,
    required: ([...requiredFields] as string[]).filter(
      (field) => properties[field]?.required !== false,
    ),
    description: schema.description,
    /* A schema that names no properties but declares what its values look
       like is a map; without this it was emitted as an empty type nothing
       could be read from. */
    valueType: mapValueType(schema, name, spec),
  };
}

function extractProperties(
  schema: SpecNode,
  spec?: SpecNode,
): Record<string, ParsedSchemaProperty> {
  const properties: Record<string, ParsedSchemaProperty> = {};
  const requiredFields = new Set(schema.required ?? []);

  for (const [propName, propSchema] of Object.entries(schema.properties ?? {})) {
    properties[propName] = convertProperty(
      propName,
      propSchema as SpecNode,
      requiredFields.has(propName),
      spec,
    );
  }
  return properties;
}
