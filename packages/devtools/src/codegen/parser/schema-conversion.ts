/**
 * OpenAPI schema → ParsedSchema conversion utilities.
 */

import { convertObjectSchema } from "./convert-object-schema";
import { toSafeIdentifier } from "./naming-utils";
import type { ParsedSchema, SpecNode } from "./types";

export function convertSchema(name: string, schema: SpecNode): ParsedSchema {
  if (schema.$ref) {
    const refName = toSafeIdentifier(schema.$ref.split("/").pop());
    return { name, type: "ref", refName, description: schema.description };
  }
  if (schema.allOf) return convertAllOf(name, schema);
  if (schema.oneOf || schema.anyOf) return convertUnion(name, schema);
  if (schema.enum)
    return { name, type: "enum", enum: schema.enum, description: schema.description };
  if (schema.type === "array") {
    return {
      name,
      type: "array",
      items: schema.items ? convertSchema(`${name}Item`, schema.items) : undefined,
      description: schema.description,
    };
  }
  if (schema.type === "object" || schema.properties) return convertObjectSchema(name, schema);
  if (["string", "number", "integer", "boolean"].includes(schema.type)) {
    return { name, type: schema.type, description: schema.description };
  }
  return { name, type: "any", description: schema.description };
}

function convertUnion(name: string, schema: SpecNode): ParsedSchema {
  const variants = schema.oneOf || schema.anyOf;
  const allEnums = variants.every((v: SpecNode) => v.enum || v.const !== undefined);
  if (allEnums) {
    const values: (string | number)[] = [];
    for (const v of variants) {
      if (v.enum) values.push(...v.enum);
      else if (v.const !== undefined) values.push(v.const);
    }
    return { name, type: "enum", enum: values, description: schema.description };
  }
  if (variants[0]) return convertSchema(name, variants[0]);
  return { name, type: "any", description: schema.description };
}

function convertAllOf(name: string, schema: SpecNode): ParsedSchema {
  const merged: SpecNode = {
    type: "object",
    properties: {},
    required: [],
    description: schema.description,
  };
  for (const sub of schema.allOf) {
    if (sub.$ref) continue;
    if (sub.properties) Object.assign(merged.properties, sub.properties);
    if (sub.required) merged.required.push(...sub.required);
    if (sub.enum) merged.enum = sub.enum;
    if (sub.type) merged.type = sub.type;
  }
  if (merged.enum)
    return { name, type: "enum", enum: merged.enum, description: schema.description };
  if (Object.keys(merged.properties).length > 0) return convertSchema(name, merged);

  const firstRef = schema.allOf.find((s: SpecNode) => s.$ref);
  if (firstRef) {
    const refName = toSafeIdentifier(firstRef.$ref.split("/").pop());
    return { name, type: "ref", refName, description: schema.description };
  }
  return { name, type: "any", description: schema.description };
}

export function convertSchemaInline(schema: SpecNode, spec: SpecNode): ParsedSchema {
  if (schema.$ref) {
    const rawName = schema.$ref.split("/").pop();
    const refName = toSafeIdentifier(rawName);
    return { name: refName, type: "ref", refName };
  }
  if (schema.allOf || schema.oneOf || schema.anyOf) return convertSchema("Inline", schema);
  if (schema.type === "array" && schema.items) {
    return { name: "Array", type: "array", items: convertSchemaInline(schema.items, spec) };
  }
  if (schema.type === "object" || schema.properties) return convertSchema("Inline", schema);
  return { name: schema.type ?? "any", type: schema.type ?? "any" };
}
