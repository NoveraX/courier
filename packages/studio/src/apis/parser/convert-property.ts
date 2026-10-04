/**
 * Converts one property of an OpenAPI object schema.
 */

import { componentIdentifier } from "./component-identifier";
import { expandPointer } from "./pointer-refs";
import { isComposite, soleMember, withoutNull } from "./property-forms";
import { componentSchemaName } from "./ref-utils";
import { convertSchema, enumValues, normalizeTypeArray } from "./schema-conversion";
import { asNode, fieldOf, isNode, listAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedSchema, ParsedSchemaProperty } from "./types";

/**
 * Convert a property, keeping every alternative it allows.
 *
 * A property that may take one of several forms keeps all of them, not the
 * first reference among them: Stripe's expandable fields — `anyOf: [string,
 * Product, DeletedProduct]` — accept the id string Stripe returns unless asked
 * to expand, and OpenAI's `anyOf: [X, {type: "null"}]` keeps the `null` the
 * API actually sends.
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
  const direction = directionOf(raw) ?? directionOf(node);
  /* One type serves the request and the answer. A readOnly property is
     produced by the server: demanded, a request body could not be built. A
     writeOnly one is sent by the client and never answered: demanded, every
     answer was refused for lacking it. Optional, either may still be there;
     the direction is kept for the request and answer types split from it. */
  const base = {
    required: required && direction === undefined,
    description: textAt(raw, "description") ?? textAt(node, "description"),
    nullable: nullable || undefined,
    ...(direction && { direction, requiredInDirection: required }),
  };

  const ref = textAt(node, "$ref");
  const component = ref !== undefined ? componentSchemaName(ref) : undefined;
  if (ref !== undefined && component === undefined) {
    return pointedProperty(name, ref, raw, base, required, spec);
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
    const converted = convertProperty(name, inner, required, spec);
    return direction ? { ...converted, ...directed(direction, required) } : converted;
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
    refName: component !== undefined ? componentIdentifier(spec, component) : undefined,
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
  required: boolean,
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
          ...(raw.writeOnly === true && { writeOnly: true }),
        },
        required,
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

/* The one direction a property travels in, when its schema names one. */
function directionOf(node: SpecNode): "read" | "write" | undefined {
  if (node.readOnly === true && node.writeOnly !== true) return "read";
  if (node.writeOnly === true && node.readOnly !== true) return "write";
  return undefined;
}

/* A property only one direction carries: optional where one schema serves both. */
function directed(
  direction: "read" | "write",
  required: boolean,
): Pick<ParsedSchemaProperty, "required" | "direction" | "requiredInDirection"> {
  return { required: false, direction, requiredInDirection: required };
}
