/**
 * Converts OpenAPI object schemas with properties into ParsedSchema.
 */

import { toSafeIdentifier } from "./naming-utils";
import { convertSchema } from "./schema-conversion";
import type { ParsedSchema, ParsedSchemaProperty, SpecNode } from "./types";

export function convertObjectSchema(name: string, schema: SpecNode): ParsedSchema {
  const properties = extractProperties(schema);
  const requiredFields = new Set(schema.required ?? []);

  return {
    name,
    type: "object",
    properties,
    required: [...requiredFields] as string[],
    description: schema.description,
  };
}

function extractProperties(schema: SpecNode): Record<string, ParsedSchemaProperty> {
  const properties: Record<string, ParsedSchemaProperty> = {};
  const requiredFields = new Set(schema.required ?? []);

  for (const [propName, propSchema] of Object.entries(schema.properties ?? {})) {
    const prop = propSchema as SpecNode;
    const resolvedProp = resolvePropertySchema(prop);

    properties[propName] = {
      type: resolvedProp.$ref ? "ref" : (resolvedProp.type ?? "any"),
      format: resolvedProp.format,
      required: requiredFields.has(propName),
      description: resolvedProp.description ?? prop.description,
      enum: resolvedProp.enum,
      refName: resolvedProp.$ref ? toSafeIdentifier(resolvedProp.$ref.split("/").pop()) : undefined,
      nullable: resolvedProp.nullable ?? prop.nullable,
      items: resolvedProp.items ? convertSchema(`${propName}Item`, resolvedProp.items) : undefined,
    };
  }
  return properties;
}

function resolvePropertySchema(prop: SpecNode): SpecNode {
  if (prop.allOf) {
    return resolveAllOfProperty(prop);
  }
  if ((prop.oneOf || prop.anyOf) && !prop.type) {
    const variants = prop.oneOf || prop.anyOf;
    const firstRef = variants.find((s: SpecNode) => s.$ref);
    if (firstRef) {
      return { ...firstRef, description: prop.description, nullable: prop.nullable };
    }
  }
  return prop;
}

function resolveAllOfProperty(prop: SpecNode): SpecNode {
  const firstRef = prop.allOf.find((s: SpecNode) => s.$ref);
  if (firstRef) {
    return { ...firstRef, description: prop.description, nullable: prop.nullable };
  }
  const merged: SpecNode = {};
  for (const sub of prop.allOf) Object.assign(merged, sub);
  return {
    ...merged,
    description: prop.description ?? merged.description,
    nullable: prop.nullable ?? merged.nullable,
  };
}
