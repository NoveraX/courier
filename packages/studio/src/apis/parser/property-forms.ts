/**
 * The forms a property's schema can take, told apart before it is converted.
 */

import { acceptsNull, stripNull } from "./nullable-schema";
import { normalizeTypeArray } from "./schema-conversion";
import { asNode, fieldOf, isNode, listAt, type SpecNode, textAt } from "./spec-node";

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
  const declared = fieldOf(node, "oneOf") ?? fieldOf(node, "anyOf");
  if (!Array.isArray(declared) || node.type) return { node, nullable };
  const variants: readonly unknown[] = declared;

  const kept = variants.filter((variant) => fieldOf(variant, "type") !== "null");
  if (kept.length === variants.length) return { node, nullable };
  if (kept.length === 1) {
    const inner = withoutNull(normalizeTypeArray(asNode(kept[0])));
    return { node: { ...inner.node, description: node.description }, nullable: true };
  }
  const key = node.oneOf ? "oneOf" : "anyOf";
  return { node: { ...node, [key]: kept }, nullable: true };
}

/**
 * Does this property take a form a single field cannot describe — one of
 * several alternatives, or an `allOf` that adds up more than one schema:
 * properties of its own, or two schemas it refers to or composes, each
 * adding fields the other lacks?
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
 * isComposite({ allOf: [{ $ref: "#/components/schemas/A" }, { $ref: "#/components/schemas/B" }] }); // true
 * ```
 */
export function isComposite(node: SpecNode): boolean {
  if (node.oneOf || node.anyOf) return !node.type || node.type === "object" || !!node.properties;
  const allOf = listAt(node, "allOf");
  if (allOf.length < 2) return false;
  if (
    allOf.some(
      (member) => isNode(member) && (Boolean(member.properties) || member.type === "object"),
    )
  ) {
    return true;
  }
  return composedSchemas(allOf) > 1;
}

/* The schemas an `allOf` adds up: each one it refers to, once, and each composition among its members. */
function composedSchemas(members: readonly unknown[]): number {
  const references = new Set<string>();
  let compositions = 0;
  for (const member of members) {
    const ref = fieldOf(member, "$ref");
    if (typeof ref === "string") references.add(ref);
    else if (Array.isArray(fieldOf(member, "allOf"))) compositions += 1;
  }
  return references.size + compositions;
}

/**
 * The member an `allOf` stands for when it composes nothing.
 *
 * `allOf: [{ $ref: X }]` is how OpenAPI 3.0 attaches a description or
 * `nullable` to a reference; the other members only annotate it, or name
 * that schema again. The description and the `nullable` they give are the
 * reference's, beside what it says itself.
 *
 * @param members - The `allOf` members
 * @returns The reference among them, annotated, or all of them merged
 * @example
 * ```ts
 * soleMember([{ $ref: "#/components/schemas/Pet" }, { description: "The pet", nullable: true }]);
 * // → { $ref: "#/components/schemas/Pet", description: "The pet", nullable: true }
 * ```
 */
export function soleMember(members: SpecNode[]): SpecNode {
  const reference = members.find((member) => member?.$ref);
  if (reference) return annotated(reference, members);
  const merged: SpecNode = {};
  for (const member of members) Object.assign(merged, member);
  return merged;
}

/* A reference with the description and the `nullable` its fellow members give, where it gives none. */
function annotated(reference: SpecNode, members: readonly SpecNode[]): SpecNode {
  const description =
    textAt(reference, "description") ??
    members.map((member) => textAt(member, "description")).find((text) => text !== undefined);
  const nullable = members.some((member) => fieldOf(member, "nullable") === true);
  return {
    ...reference,
    ...(description !== undefined && { description }),
    ...(nullable && { nullable: true }),
  };
}
