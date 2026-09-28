/**
 * Converts one property of an OpenAPI object schema.
 */

import { toSafeIdentifier } from "./naming-utils";
import { expandPointer } from "./pointer-refs";
import { isComposite, soleMember, withoutNull } from "./property-forms";
import { componentSchemaName } from "./ref-utils";
import { convertSchema, enumValues, normalizeTypeArray } from "./schema-conversion";
import { asNode, fieldOf, isNode, listAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedSchema, ParsedSchemaProperty } from "./types";

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
  /* A readOnly property is produced by the server. Demanding it made a
     request body impossible to construct, while leaving it optional still
     lets a response carry it. */
  const base = {
    required: required && node.readOnly !== true && raw.readOnly !== true,
    description: textAt(raw, "description") ?? textAt(node, "description"),
    nullable: nullable || undefined,
  };

  const ref = textAt(node, "$ref");
  const component = ref !== undefined ? componentSchemaName(ref) : undefined;
  if (ref !== undefined && component === undefined) {
    return pointedProperty(name, ref, raw, base, spec);
  }
  if (isComposite(node)) {
    const shape = convertSchema(`${name}Value`, node, spec);
    if (shape.type === "ref") return { ...base, type: "ref", refName: shape.refName };
    return { ...base, type: shape.type, shape };
  }
  if (node.allOf) {
    const member = soleMember(listAt(node, "allOf").map(asNode));
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
    type:
      component !== undefined
        ? "ref"
        : (textAt(node, "type") ?? (constant ? typeof node.const : "any")),
    format: textAt(node, "format"),
    enum:
      node.enum !== undefined ? enumValues(listAt(node, "enum")) : constant && enumValues(constant),
    refName: component !== undefined ? toSafeIdentifier(component) : undefined,
    items: node.items ? convertSchema(`${name}Item`, asNode(node.items), spec) : undefined,
    /* An inline object keeps its own shape rather than flattening. */
    shape: node.properties ? convertSchema(`${name}Object`, node, spec) : undefined,
    valueType: mapValueType(node, name, spec),
  };
}

/**
 * A property whose schema is a reference into another part of the document,
 * converted from what it points at, keeping what the property itself says.
 */
function pointedProperty(
  name: string,
  ref: string,
  raw: SpecNode,
  base: Pick<ParsedSchemaProperty, "required" | "description" | "nullable">,
  spec: SpecNode | undefined,
): ParsedSchemaProperty {
  return expandPointer(
    ref,
    spec,
    (target) =>
      convertProperty(
        name,
        {
          ...target,
          ...(base.description !== undefined && { description: base.description }),
          ...(base.nullable && { nullable: true }),
          ...(raw.readOnly === true && { readOnly: true }),
        },
        base.required,
        spec,
      ),
    () => ({ ...base, type: "any" }),
  );
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
  const additional = fieldOf(node, "additionalProperties");
  if (!isNode(additional)) return undefined;
  return convertSchema(`${name}Value`, additional, spec);
}
