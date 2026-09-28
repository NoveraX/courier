import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { collectGroupSchemas, collectRefsDeep, withDependencies } from "./schema-refs";

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

  /* An extracted type is declared even when no endpoint names it as a
     schema — a parameters type is only ever named as a type — and so is
     everything it refers to, at any depth: inside a list, a map or one of
     several forms. */
  const direct = new Set(Object.keys(extracted));
  for (const schema of Object.values(extracted)) collectRefsDeep(schema, direct);
  for (const name of withDependencies(direct, extendedSpec)) names.add(name);

  const result: Record<string, ParsedSchema> = {};
  for (const name of names) {
    if (spec.schemas[name]) result[name] = spec.schemas[name];
    else if (extracted[name]) result[name] = extracted[name];
  }
  return result;
}
