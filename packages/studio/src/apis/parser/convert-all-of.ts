/**
 * Converts a schema composed with `allOf` into the one it adds up to.
 */

import { resolveRef } from "./ref-utils";
import { referencedSchema } from "./referenced-schema";
import { convertSchema, normalizeTypeArray } from "./schema-conversion";
import type { ParsedSchema, SpecNode } from "./types";

/**
 * Merge every member of an `allOf` into one schema.
 *
 * An `allOf` member that is a reference carries the inherited half of the
 * type. Skipping it dropped every one of those properties from the emitted
 * type, and the validator then stripped them off the response.
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
  const merged: SpecNode = {
    type: "object",
    properties: {},
    required: [],
    description: schema.description,
  };
  for (const sub of flattenAllOf(schema.allOf, spec)) {
    if (sub.properties) Object.assign(merged.properties, sub.properties);
    if (sub.required) merged.required.push(...sub.required);
    if (sub.enum) merged.enum = sub.enum;
    if (sub.type) merged.type = sub.type;
  }
  if (merged.enum)
    return { name, type: "enum", enum: merged.enum, description: schema.description };
  if (Object.keys(merged.properties).length > 0) return convertSchema(name, merged, spec);

  const firstRef = schema.allOf.find((s: SpecNode) => typeof s?.$ref === "string");
  if (firstRef) return referencedSchema(name, firstRef.$ref, schema.description, spec);
  return { name, type: "any", description: schema.description };
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
