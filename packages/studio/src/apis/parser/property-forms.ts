/**
 * The forms a property's schema can take, told apart before it is converted.
 */

import { acceptsNull, stripNull } from "./nullable-schema";
import { normalizeTypeArray } from "./schema-conversion";
import type { SpecNode } from "./types";

/**
 * Separate "may be null" from the forms a property takes.
 *
 * OpenAPI 3.1 writes it as a `{ type: "null" }` alternative; a property with
 * one other alternative is then simply that alternative, or null. The node
 * handed on no longer says it is nullable, so a shape converted from it does
 * not carry the `null` a second time.
 *
 * @param given - The property's schema, its type array already normalized
 * @returns The schema without its null alternative, and whether it had one
 * @example
 * ```ts
 * withoutNull({ anyOf: [{ type: "string" }, { type: "null" }] });
 * // → { node: { type: "string", description: undefined }, nullable: true }
 * ```
 */
export function withoutNull(given: SpecNode): { node: SpecNode; nullable: boolean } {
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
 *
 * @param node - The property's schema
 * @returns Whether it needs a schema of its own
 * @example
 * ```ts
 * isComposite({ anyOf: [{ type: "string" }, { $ref: "#/components/schemas/Product" }] }); // true
 * ```
 */
export function isComposite(node: SpecNode): boolean {
  if (node.oneOf || node.anyOf) return !node.type || node.type === "object" || !!node.properties;
  if (!Array.isArray(node.allOf) || node.allOf.length < 2) return false;
  return node.allOf.some((member: SpecNode) => member?.properties || member?.type === "object");
}

/**
 * The member an `allOf` stands for when it composes nothing.
 *
 * `allOf: [{ $ref: X }]` is how OpenAPI 3.0 attaches a description or
 * `nullable` to a reference; the other members only annotate it.
 *
 * @param members - The `allOf` members
 * @returns The reference among them, or all of them merged
 * @example
 * ```ts
 * soleMember([{ $ref: "#/components/schemas/Pet" }, { description: "The pet" }]); // { $ref: … }
 * ```
 */
export function soleMember(members: SpecNode[]): SpecNode {
  const reference = members.find((member) => member?.$ref);
  if (reference) return reference;
  const merged: SpecNode = {};
  for (const member of members) Object.assign(merged, member);
  return merged;
}
