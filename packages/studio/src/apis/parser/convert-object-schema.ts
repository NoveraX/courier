/**
 * Converts OpenAPI object schemas with properties into ParsedSchema.
 */

import { toSafeIdentifier } from "./naming-utils";
import { convertSchema, normalizeTypeArray } from "./schema-conversion";
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

/** The value type of `additionalProperties`, when it describes one. */
function mapValueType(node: SpecNode, name: string, spec?: SpecNode): ParsedSchema | undefined {
  const additional = node?.additionalProperties;
  if (!additional || typeof additional !== "object") return undefined;
  return convertSchema(`${name}Value`, additional, spec);
}

function extractProperties(
  schema: SpecNode,
  spec?: SpecNode,
): Record<string, ParsedSchemaProperty> {
  const properties: Record<string, ParsedSchemaProperty> = {};
  const requiredFields = new Set(schema.required ?? []);

  for (const [propName, propSchema] of Object.entries(schema.properties ?? {})) {
    const prop = propSchema as SpecNode;
    const resolvedProp = normalizeTypeArray(resolvePropertySchema(prop, spec));

    properties[propName] = {
      type: resolvedProp.$ref ? "ref" : (resolvedProp.type ?? "any"),
      format: resolvedProp.format,
      /* A `readOnly` property is produced by the server. Demanding it made a
         request body impossible to construct, while leaving it optional still
         lets a response carry it. */
      required: requiredFields.has(propName) && resolvedProp.readOnly !== true,
      description: resolvedProp.description ?? prop.description,
      enum: resolvedProp.enum,
      refName: resolvedProp.$ref ? toSafeIdentifier(resolvedProp.$ref.split("/").pop()) : undefined,
      nullable: resolvedProp.nullable ?? prop.nullable,
      items: resolvedProp.items
        ? convertSchema(`${propName}Item`, resolvedProp.items, spec)
        : undefined,
      /* An inline object keeps its own shape rather than flattening. */
      object: resolvedProp.properties
        ? convertSchema(`${propName}Object`, resolvedProp, spec)
        : undefined,
      valueType: mapValueType(resolvedProp, propName, spec),
    };
  }
  return properties;
}

function resolvePropertySchema(prop: SpecNode, spec?: SpecNode): SpecNode {
  if (prop.allOf) {
    return resolveAllOfProperty(prop, spec);
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

function resolveAllOfProperty(prop: SpecNode, _spec?: SpecNode): SpecNode {
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
