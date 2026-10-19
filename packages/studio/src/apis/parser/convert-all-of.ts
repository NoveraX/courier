/**
 * Converts a schema composed with `allOf` into the one it adds up to.
 */

import { mergedComposition } from "./recursive-compositions";
import { resolveRef } from "./ref-utils";
import { referencedSchema } from "./referenced-schema";
import { convertSchema, enumValues, normalizeTypeArray } from "./schema-conversion";
import { isNode, listAt, nodeAt, type SpecNode, textAt } from "./spec-node";
import type { ParsedSchema } from "./types";

/**
 * Merge every member of an `allOf` into one schema.
 *
 * An `allOf` member that is a reference carries the inherited half of the
 * type. Skipping it dropped every one of those properties from the emitted
 * type, and the validator then stripped them off the response. A
 * composition found inside itself — a category's `parent` composed of the
 * category — is declared as a schema of its own, which it refers to.
 *
 * @param name - The schema's name
 * @param schema - The schema holding the `allOf`
 * @param spec - The whole specification, for following references
 * @returns The merged schema; a reference when the members add nothing to one
 * @example
 * ```ts
 * convertAllOf("Dog", { allOf: [{ $ref: "#/components/schemas/Pet" }, { properties: { bark: {} } }] }, spec);
 * ```
 */
export function convertAllOf(name: string, schema: SpecNode, spec?: SpecNode): ParsedSchema {
  const description = textAt(schema, "description");
  return mergedComposition(listAt(schema, "allOf"), name, description, () =>
    merged(name, schema, description, spec),
  );
}

function merged(
  name: string,
  schema: SpecNode,
  description: string | undefined,
  spec: SpecNode | undefined,
): ParsedSchema {
  const properties: Record<string, unknown> = {};
  const required: unknown[] = [];
  let enumeration: unknown;
  let type: unknown = "object";
  for (const sub of flattenAllOf(listAt(schema, "allOf"), spec)) {
    Object.assign(properties, nodeAt(sub, "properties"));
    required.push(...listAt(sub, "required"));
    if (sub.enum) enumeration = sub.enum;
    if (sub.type) type = sub.type;
  }

  if (enumeration) {
    return {
      name,
      type: "enum",
      enum: enumValues(Array.isArray(enumeration) ? enumeration : []),
      description,
    };
  }
  if (Object.keys(properties).length > 0) {
    return convertSchema(
      name,
      { type, properties, required, description: schema.description },
      spec,
    );
  }
  const firstRef = listAt(schema, "allOf")
    .map((member) => textAt(member, "$ref"))
    .find((ref) => ref !== undefined);
  if (firstRef !== undefined) return referencedSchema(name, firstRef, description, spec);
  return { name, type: "any", description };
}

/**
 * Every member of an `allOf`, with references followed.
 *
 * A base may itself be composed, so this recurses; `seen` stops a definition
 * that refers to itself from doing so forever.
 */
function flattenAllOf(
  members: readonly unknown[],
  spec?: SpecNode,
  seen = new Set<string>(),
): SpecNode[] {
  const out: SpecNode[] = [];
  for (const member of members) {
    if (!isNode(member)) continue;
    const ref = textAt(member, "$ref");
    if (ref) {
      if (!spec || seen.has(ref)) continue;
      seen.add(ref);
      const target = normalizeTypeArray(resolveRef(spec, ref));
      if (target.allOf) out.push(...flattenAllOf(listAt(target, "allOf"), spec, seen));
      else out.push(target);
      continue;
    }
    if (member.allOf) {
      out.push(...flattenAllOf(listAt(member, "allOf"), spec, seen));
      continue;
    }
    out.push(normalizeTypeArray(member));
  }
  return out;
}
