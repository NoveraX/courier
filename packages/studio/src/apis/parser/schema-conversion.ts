/**
 * OpenAPI schema → ParsedSchema conversion utilities.
 */

import { convertAllOf } from "./convert-all-of";
import { convertObjectSchema } from "./convert-object-schema";
import { acceptsNull, orNull, stripNull } from "./nullable-schema";
import { referencedSchema } from "./referenced-schema";
import { asNode, fieldOf, listAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedSchema } from "./types";

const PRIMITIVES = new Set(["string", "number", "integer", "boolean", "null"]);
const SCHEMA_TYPES: ReadonlySet<string> = new Set([
  ...PRIMITIVES,
  "object",
  "array",
  "enum",
  "ref",
  "union",
  "any",
]);
type PrimitiveType = "string" | "number" | "integer" | "boolean" | "null";

function isPrimitiveType(type: string | undefined): type is PrimitiveType {
  return type !== undefined && PRIMITIVES.has(type);
}

function isSchemaType(type: string | undefined): type is ParsedSchema["type"] {
  return type !== undefined && SCHEMA_TYPES.has(type);
}

/** A declared type the parsed schema can hold; `any` for none, or one it does not know. */
export function schemaTypeOf(type: string | undefined): ParsedSchema["type"] {
  return isSchemaType(type) ? type : "any";
}

/** The values an `enum` lists that a generated type can hold. */
export function enumValues(values: readonly unknown[]): (string | number | boolean)[] {
  return values.filter(
    (value): value is string | number | boolean =>
      typeof value === "string" || typeof value === "number" || typeof value === "boolean",
  );
}

/**
 * Fold the OpenAPI 3.1 spelling of a nullable type into the 3.0 one.
 *
 * 3.1 writes `"type": ["string", "null"]`; reading that as a type name left
 * the schema as `unknown` and lost the type entirely.
 */
export function normalizeTypeArray(schema: SpecNode): SpecNode {
  const declared = fieldOf(schema, "type");
  if (!Array.isArray(declared)) return schema;
  const types = declared.filter((type): type is string => typeof type === "string");
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
  const description = textAt(schema, "description");
  if (acceptsNull(schema)) return orNull(convertSchema(name, stripNull(schema), spec));
  const ref = textAt(schema, "$ref");
  if (ref !== undefined) return referencedSchema(name, ref, description, spec);
  if (schema.allOf) return convertAllOf(name, schema, spec);
  if ((schema.oneOf || schema.anyOf) && !constrainsAnObject(schema)) {
    return convertUnion(name, schema, spec);
  }
  if (schema.enum)
    return { name, type: "enum", enum: enumValues(listAt(schema, "enum")), description };
  const type = textAt(schema, "type");
  if (type === "array") {
    const items = schema.items
      ? convertSchema(`${name}Item`, asNode(schema.items), spec)
      : undefined;
    return { name, type: "array", items, description };
  }
  if (type === "object" || schema.properties) return convertObjectSchema(name, schema, spec);
  if (isPrimitiveType(type)) return { name, type, description };
  return { name, type: "any", description };
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
  return variants.every((variant: unknown) => !carriesShape(variant));
}

/** A variant carries shape when it says anything about the type itself. */
function carriesShape(given: unknown): boolean {
  if (!given || typeof given !== "object") return false;
  const variant = asNode(given);
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
  const description = textAt(schema, "description");
  const variants = listAt(schema, fieldOf(schema, "oneOf") ? "oneOf" : "anyOf").map(asNode);
  if (variants.every((v) => v.enum || v.const !== undefined)) {
    const values = variants.flatMap((v) => (v.enum ? listAt(v, "enum") : [v.const]));
    return { name, type: "enum", enum: enumValues(values), description };
  }
  const parsed = listAt(schema, fieldOf(schema, "oneOf") ? "oneOf" : "anyOf")
    .filter((variant) => variant && typeof variant === "object")
    .map((variant, index) => convertSchema(`${name}Variant${index + 1}`, asNode(variant), spec));

  const [sole] = parsed;
  if (parsed.length === 0 || !sole) return { name, type: "any", description };
  if (parsed.length === 1) return { ...sole, name };
  return { name, type: "union", variants: parsed, description };
}
