/**
 * OpenAPI schema → ParsedSchema conversion utilities.
 */

import { convertAllOf } from "./convert-all-of";
import { convertObjectSchema } from "./convert-object-schema";
import { acceptsNull, orNull, stripNull } from "./nullable-schema";
import { referencedSchema } from "./referenced-schema";
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
  /* `["null"]` alone is the `null` type, not a nullable nothing. */
  if (named.length === 0) return { ...schema, type: types.length > 0 ? "null" : undefined };
  return {
    ...schema,
    type: named.length === 1 ? named[0] : undefined,
    ...(named.length > 1 && { oneOf: named.map((t) => ({ type: t })) }),
    nullable: schema.nullable ?? types.includes("null"),
  };
}

/**
 * Convert a schema, keeping `null` wherever it allows it.
 *
 * A component that says `nullable: true` — GitHub's `nullable-simple-user`,
 * referenced by every issue's assignee — lost it here, so each reference
 * rejected the `null` the API sends. It now becomes a union with `null`.
 *
 * @param name - Name of the schema, used to name the schemas nested in it
 * @param raw - The schema as written in the specification
 * @param spec - The whole specification, for resolving references
 * @returns The parsed schema
 * @example
 * ```ts
 * convertSchema("MaybeName", { type: "string", nullable: true });
 * // → { name: "MaybeName", type: "union", variants: [string, null] }
 * ```
 */
export function convertSchema(name: string, raw: SpecNode, spec?: SpecNode): ParsedSchema {
  const schema = normalizeTypeArray(raw);
  if (acceptsNull(schema)) return orNull(convertSchema(name, stripNull(schema), spec));
  if (typeof schema.$ref === "string") {
    return referencedSchema(name, schema.$ref, schema.description, spec);
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
  if (["string", "number", "integer", "boolean", "null"].includes(schema.type)) {
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
