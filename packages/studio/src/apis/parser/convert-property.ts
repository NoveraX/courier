/**
 * Converts one property of an OpenAPI object schema.
 */

import { toSafeIdentifier } from "./naming-utils";
import { acceptsNull, stripNull } from "./nullable-schema";
import { convertSchema, normalizeTypeArray } from "./schema-conversion";
import type { ParsedSchema, ParsedSchemaProperty, SpecNode } from "./types";

/**
 * Convert a property, keeping every alternative it allows.
 *
 * A property that may take one of several forms used to keep only the first
 * reference among them. Stripe's expandable fields — `anyOf: [string, Product,
 * DeletedProduct]` — became `Product`, which rejects the id string Stripe
 * returns unless asked to expand; and OpenAI's `anyOf: [X, {type: "null"}]`
 * lost the `null` the API actually sends.
 *
 * @param name - Property name, used to name the schemas nested in it
 * @param raw - The property's schema as written in the specification
 * @param required - Whether the enclosing object lists it as required
 * @param spec - The whole specification, for resolving references
 * @returns The parsed property
 *
 * @example
 * ```ts
 * convertProperty("product", { anyOf: [{ type: "string" }, { $ref: "#/c/s/product" }] }, true)
 * // → { type: "union", shape: { type: "union", variants: [string, ref Product] }, … }
 * ```
 */
export function convertProperty(
  name: string,
  raw: SpecNode,
  required: boolean,
  spec?: SpecNode,
): ParsedSchemaProperty {
  const { node, nullable } = withoutNull(normalizeTypeArray(raw));
  /* A `readOnly` property is produced by the server. Demanding it made a
     request body impossible to construct, while leaving it optional still
     lets a response carry it. */
  const base = {
    required: required && node.readOnly !== true && raw.readOnly !== true,
    description: raw.description ?? node.description,
    nullable: nullable || undefined,
  };

  if (isComposite(node)) {
    const shape = convertSchema(`${name}Value`, node, spec);
    if (shape.type === "ref") return { ...base, type: "ref", refName: shape.refName };
    return { ...base, type: shape.type, shape };
  }
  if (node.allOf) {
    const member = soleMember(node.allOf as SpecNode[]);
    const inner = {
      ...member,
      description: base.description,
      nullable: nullable || member.nullable,
    };
    return convertProperty(name, inner, base.required, spec);
  }

  const constant = node.const === undefined ? undefined : [node.const];
  return {
    ...base,
    type: node.$ref ? "ref" : (node.type ?? (constant ? typeof node.const : "any")),
    format: node.format,
    enum: node.enum ?? constant,
    refName: node.$ref ? toSafeIdentifier(node.$ref.split("/").pop()) : undefined,
    items: node.items ? convertSchema(`${name}Item`, node.items, spec) : undefined,
    /* An inline object keeps its own shape rather than flattening. */
    shape: node.properties ? convertSchema(`${name}Object`, node, spec) : undefined,
    valueType: mapValueType(node, name, spec),
  };
}

/**
 * The value type of `additionalProperties`, when it describes one.
 *
 * @param node - An object schema
 * @param name - Name of the schema, used to name the value schema
 * @param spec - The whole specification, for resolving references
 * @returns The value schema, or `undefined` for a closed or untyped map
 */
export function mapValueType(
  node: SpecNode,
  name: string,
  spec?: SpecNode,
): ParsedSchema | undefined {
  const additional = node?.additionalProperties;
  if (!additional || typeof additional !== "object") return undefined;
  return convertSchema(`${name}Value`, additional, spec);
}

/**
 * Separate "may be null" from the forms a property takes.
 *
 * OpenAPI 3.1 writes it as a `{ type: "null" }` alternative; a property with
 * one other alternative is then simply that alternative, or null. The node
 * handed on no longer says it is nullable, so a shape converted from it does
 * not carry the `null` a second time.
 */
function withoutNull(given: SpecNode): { node: SpecNode; nullable: boolean } {
  const nullable = acceptsNull(given);
  const node = nullable ? stripNull(given) : given;
  const variants: SpecNode[] | undefined = node.oneOf ?? node.anyOf;
  if (!Array.isArray(variants) || node.type) return { node, nullable };

  const kept = variants.filter((variant) => variant?.type !== "null");
  if (kept.length === variants.length) return { node, nullable };
  if (kept.length === 1) {
    const inner = withoutNull(normalizeTypeArray(kept[0] as SpecNode));
    return { node: { ...inner.node, description: node.description }, nullable: true };
  }
  const key = node.oneOf ? "oneOf" : "anyOf";
  return { node: { ...node, [key]: kept }, nullable: true };
}

/**
 * Does this property take a form a single field cannot describe — one of
 * several alternatives, or an `allOf` that adds properties of its own?
 *
 * A `type` beside `anyOf` normally just narrows the type, as in a string
 * that is one of two formats; only an object uses `anyOf` to say which of
 * its properties are required.
 */
function isComposite(node: SpecNode): boolean {
  if (node.oneOf || node.anyOf) return !node.type || node.type === "object" || !!node.properties;
  if (!Array.isArray(node.allOf) || node.allOf.length < 2) return false;
  return node.allOf.some((member: SpecNode) => member?.properties || member?.type === "object");
}

/**
 * The member an `allOf` stands for when it composes nothing.
 *
 * `allOf: [{ $ref: X }]` is how OpenAPI 3.0 attaches a description or
 * `nullable` to a reference; the other members only annotate it.
 */
function soleMember(members: SpecNode[]): SpecNode {
  const reference = members.find((member) => member?.$ref);
  if (reference) return reference;
  const merged: SpecNode = {};
  for (const member of members) Object.assign(merged, member);
  return merged;
}
