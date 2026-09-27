import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { collectGroupSchemas } from "./schema-refs";

/**
 * Collect the schemas one group's files declare: the spec's schemas the
 * group refers to and the types extracted from its endpoints, each with
 * every schema it refers to in turn.
 *
 * @param group - The group, its endpoints' types already extracted
 * @param spec - The parsed spec
 * @param extracted - The types extracted from the group's endpoints, by name
 * @returns Every schema the group needs, by name
 * @example
 * ```ts
 * const { group: processed, schemas } = extractEndpointTypes(group);
 * buildSchemaRecord(processed, spec, schemas);
 * ```
 */
export function buildSchemaRecord(
  group: ParsedGroup,
  spec: ParsedSpec,
  extracted: Record<string, ParsedSchema>,
): Record<string, ParsedSchema> {
  /* Use extended spec so BFS can resolve deps from extracted schemas */
  const extendedSpec = { ...spec, schemas: { ...spec.schemas, ...extracted } };
  const names = collectGroupSchemas(group, extendedSpec);

  /* Ensure all extracted types are included + collect their transitive deps */
  for (const [name, schema] of Object.entries(extracted)) {
    names.add(name);
    collectDeepRefs(schema, spec, names);
  }

  const result: Record<string, ParsedSchema> = {};
  for (const name of names) {
    if (spec.schemas[name]) result[name] = spec.schemas[name];
    else if (extracted[name]) result[name] = extracted[name];
  }
  return result;
}

/** Recursively collect schema refs from properties */
function collectDeepRefs(schema: ParsedSchema, spec: ParsedSpec, refs: Set<string>): void {
  if (!schema.properties) return;
  for (const prop of Object.values(schema.properties)) {
    const refSchema = prop.refName ? spec.schemas[prop.refName] : undefined;
    if (prop.refName && refSchema && !refs.has(prop.refName)) {
      refs.add(prop.refName);
      collectDeepRefs(refSchema, spec, refs);
    }
    const itemRef = prop.items?.type === "ref" ? prop.items.refName : undefined;
    const itemSchema = itemRef ? spec.schemas[itemRef] : undefined;
    if (itemRef && itemSchema && !refs.has(itemRef)) {
      refs.add(itemRef);
      collectDeepRefs(itemSchema, spec, refs);
    }
  }
}
