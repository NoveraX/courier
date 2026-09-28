/**
 * A schema that accepts `null` besides the values it describes.
 */

import type { ParsedSchema, SpecNode } from "./types";

/**
 * Does this schema accept `null`?
 *
 * OpenAPI 3.0 says so with `nullable: true`, and 3.1 with `"null"` among its
 * types, which `normalizeTypeArray` folds into the same flag. Either may also
 * list `null` among an enum's values.
 *
 * @param schema - A schema node, its type array already normalized
 * @returns Whether `null` is one of the values it allows
 * @example
 * ```ts
 * acceptsNull({ type: "string", nullable: true }); // true
 * acceptsNull({ enum: ["on", "off", null] }); // true
 * acceptsNull({ type: "string" }); // false
 * ```
 */
export function acceptsNull(schema: SpecNode): boolean {
  if (schema.nullable === true) return true;
  return Array.isArray(schema.enum) && schema.enum.includes(null);
}

/**
 * The schema without what made it accept `null`.
 *
 * @param schema - A schema node
 * @returns The same node, not nullable, with `null` gone from its enum; an
 *   enum of `null` alone becomes the `null` type
 * @example
 * ```ts
 * stripNull({ enum: ["on", null], nullable: true }); // → { enum: ["on"] }
 * ```
 */
export function stripNull(schema: SpecNode): SpecNode {
  const { nullable: _nullable, ...rest } = schema;
  if (!Array.isArray(schema.enum)) return rest;
  const values = schema.enum.filter((value: unknown) => value !== null);
  if (values.length > 0) return { ...rest, enum: values };
  const { enum: _enum, ...bare } = rest;
  return { ...bare, type: "null" };
}

/**
 * A parsed schema widened to accept `null` as well.
 *
 * The schema becomes one alternative of a union whose other is `null`, which
 * every validator and the emitted types already express. A union gains the
 * alternative; `any` and `null` accept it already.
 *
 * @param schema - The schema as converted without its nullability
 * @returns A schema accepting its own values or `null`
 * @example
 * ```ts
 * orNull({ name: "MaybeName", type: "string" });
 * // → { name: "MaybeName", type: "union", variants: [string, null] }
 * ```
 */
export function orNull(schema: ParsedSchema): ParsedSchema {
  if (schema.type === "any" || schema.type === "null") return schema;
  const nullVariant: ParsedSchema = { name: `${schema.name}Null`, type: "null" };

  if (schema.type === "union") {
    const variants = schema.variants ?? [];
    if (variants.some((variant) => variant.type === "null")) return schema;
    return { ...schema, variants: [...variants, nullVariant] };
  }
  return {
    name: schema.name,
    type: "union",
    variants: [{ ...schema, name: `${schema.name}Value`, description: undefined }, nullVariant],
    description: schema.description,
  };
}
