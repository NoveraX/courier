/**
 * OpenAPI schema → ParsedSchema conversion utilities.
 */

import { convertObjectSchema } from "./convert-object-schema";
import { toSafeIdentifier } from "./naming-utils";
import { resolveRef } from "./ref-utils";
import type { ParsedSchema, SpecNode } from "./types";

/**
 * Fold the OpenAPI 3.1 spelling of a nullable type into the 3.0 one.
 *
 * 3.1 writes `"type": ["string", "null"]`; reading that as a type name left
 * the schema as `unknown` and lost the type entirely.
 */
export function normalizeTypeArray(schema: SpecNode): SpecNode {
  if (!Array.isArray(schema?.type)) return schema;
  const types = schema.type as string[];
  const named = types.filter((t) => t !== "null");
  return {
    ...schema,
    type: named.length === 1 ? named[0] : undefined,
    ...(named.length > 1 && { oneOf: named.map((t) => ({ type: t })) }),
    nullable: schema.nullable ?? types.includes("null"),
  };
}

export function convertSchema(name: string, raw: SpecNode, spec?: SpecNode): ParsedSchema {
  const schema = normalizeTypeArray(raw);
  if (schema.$ref) {
    const refName = toSafeIdentifier(schema.$ref.split("/").pop());
    return { name, type: "ref", refName, description: schema.description };
  }
  if (schema.allOf) return convertAllOf(name, schema, spec);
  if ((schema.oneOf || schema.anyOf) && !constrainsAnObject(schema)) {
    return convertUnion(name, schema, spec);
  }
  if (schema.enum)
    return { name, type: "enum", enum: schema.enum, description: schema.description };
  if (schema.type === "array") {
    return {
      name,
      type: "array",
      items: schema.items ? convertSchema(`${name}Item`, schema.items, spec) : undefined,
      description: schema.description,
    };
  }
  if (schema.type === "object" || schema.properties) return convertObjectSchema(name, schema, spec);
  if (["string", "number", "integer", "boolean"].includes(schema.type)) {
    return { name, type: schema.type, description: schema.description };
  }
  return { name, type: "any", description: schema.description };
}

/**
 * Does this schema describe an object and merely use `anyOf` to say which of
 * its own properties are required?
 *
 * OpenAI's `ImageRefParam` declares `type: object` with two properties and
 * then `anyOf: [{required: [a]}, {required: [b]}]` to demand exactly one of
 * them. Treating that as a union threw the properties away and left the type
 * as `any` — and since nothing was left to emit, every reference to it named
 * a type no file declared.
 */
function constrainsAnObject(schema: SpecNode): boolean {
  if (!schema.properties && schema.type !== "object") return false;
  const variants = schema.oneOf ?? schema.anyOf;
  if (!Array.isArray(variants) || variants.length === 0) return false;
  return variants.every((variant: SpecNode) => !carriesShape(variant));
}

/** A variant carries shape when it says anything about the type itself. */
function carriesShape(variant: SpecNode): boolean {
  if (!variant || typeof variant !== "object") return false;
  return Boolean(
    variant.$ref ||
      variant.type ||
      variant.properties ||
      variant.items ||
      variant.enum ||
      variant.const !== undefined ||
      variant.allOf ||
      variant.oneOf ||
      variant.anyOf,
  );
}

function convertUnion(name: string, schema: SpecNode, spec?: SpecNode): ParsedSchema {
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
  const parsed = variants
    .filter((variant: SpecNode) => variant && typeof variant === "object")
    .map((variant: SpecNode, index: number) =>
      convertSchema(`${name}Variant${index + 1}`, variant, spec),
    );

  if (parsed.length === 0) return { name, type: "any", description: schema.description };
  if (parsed.length === 1) return { ...(parsed[0] as ParsedSchema), name };
  return { name, type: "union", variants: parsed, description: schema.description };
}

function convertAllOf(name: string, schema: SpecNode, spec?: SpecNode): ParsedSchema {
  const merged: SpecNode = {
    type: "object",
    properties: {},
    required: [],
    description: schema.description,
  };
  /* An `allOf` member that is a reference carries the inherited half of the
     type. Skipping it dropped every one of those properties from the emitted
     type, and the validator then stripped them off the response. */
  for (const sub of flattenAllOf(schema.allOf, spec)) {
    if (sub.properties) Object.assign(merged.properties, sub.properties);
    if (sub.required) merged.required.push(...sub.required);
    if (sub.enum) merged.enum = sub.enum;
    if (sub.type) merged.type = sub.type;
  }
  if (merged.enum)
    return { name, type: "enum", enum: merged.enum, description: schema.description };
  if (Object.keys(merged.properties).length > 0) return convertSchema(name, merged, spec);

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

/**
 * Every member of an `allOf`, with references followed.
 *
 * A base may itself be composed, so this recurses; `seen` stops a definition
 * that refers to itself from doing so forever.
 */
function flattenAllOf(members: SpecNode[], spec?: SpecNode, seen = new Set<string>()): SpecNode[] {
  const out: SpecNode[] = [];
  for (const member of members ?? []) {
    if (!member || typeof member !== "object") continue;

    if (member.$ref) {
      if (!spec || seen.has(member.$ref)) continue;
      seen.add(member.$ref);
      const target = normalizeTypeArray(resolveRef(spec, member.$ref));
      if (target.allOf) out.push(...flattenAllOf(target.allOf, spec, seen));
      else out.push(target);
      continue;
    }

    if (member.allOf) {
      out.push(...flattenAllOf(member.allOf, spec, seen));
      continue;
    }
    out.push(normalizeTypeArray(member));
  }
  return out;
}
