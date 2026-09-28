/**
 * Converts OpenAPI object schemas with properties into ParsedSchema.
 */

import { convertProperty, mapValueType } from "./convert-property";
import { asNode, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedSchema, ParsedSchemaProperty } from "./types";

export function convertObjectSchema(name: string, schema: SpecNode, spec?: SpecNode): ParsedSchema {
  const properties = extractProperties(schema, spec);
  const requiredFields = requiredOf(schema);

  return {
    name,
    type: "object",
    properties,
    required: [...requiredFields].filter((field) => properties[field]?.required !== false),
    description: textAt(schema, "description"),
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
  const requiredFields = requiredOf(schema);

  for (const [propName, propSchema] of Object.entries(nodeAt(schema, "properties") ?? {})) {
    properties[propName] = convertProperty(
      propName,
      asNode(propSchema),
      requiredFields.has(propName),
      spec,
    );
  }
  return properties;
}

/* The fields a schema requires, as the names it lists. */
function requiredOf(schema: SpecNode): Set<string> {
  return new Set(
    listAt(schema, "required").filter((field): field is string => typeof field === "string"),
  );
}
