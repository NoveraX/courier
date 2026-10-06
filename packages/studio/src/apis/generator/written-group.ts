import { isTopLevel, TOP_LEVEL } from "../parser/top-level";
import type { ParsedGroup, ParsedSchema, ParsedSpec } from "../parser/types";
import { buildSchemaRecord } from "./build-schema-record";
import { extractEndpointTypes } from "./extract-endpoint-types";
import type { ExtractedTypeNames } from "./extracted-type-names";

/** A group's endpoints as they are written, and where the schemas they name are declared. */
export interface WrittenGroup {
  /** The group, the types of its endpoints extracted. */
  group: ParsedGroup;
  /** The type naming each endpoint's variables, by the endpoint's name. */
  params: Record<string, string>;
  /** The schemas the group's own module declares; for the API's own endpoints, the import's module. */
  own: Record<string, ParsedSchema>;
  /** The schemas the group imports from the import's own module, which other groups use too. */
  shared: Record<string, ParsedSchema>;
}

/**
 * Extract a group's types and split the schemas its endpoints need between
 * the group's own module and the import's: a schema the import's module
 * declares is imported from there, every other one is declared beside the
 * group's endpoints, as are the types extracted from them.
 *
 * @param group - The group, as the import generates it
 * @param spec - The specification, its schemas looked up by name
 * @param names - The name each extracted type takes
 * @param homes - Where each of the specification's schemas is declared
 * @returns The group as written, and its schemas split
 * @example
 * ```ts
 * writtenGroup(pets, spec, names, schemaHomes(whole)).shared; // { Category: … }
 * ```
 */
export function writtenGroup(
  group: ParsedGroup,
  spec: ParsedSpec,
  names: ExtractedTypeNames,
  homes: ReadonlyMap<string, string>,
): WrittenGroup {
  const { group: processed, schemas: extracted, params } = extractEndpointTypes(group, names);
  const record = buildSchemaRecord(processed, spec, extracted);
  if (isTopLevel(group)) return { group: processed, params, own: record, shared: {} };
  const own: Record<string, ParsedSchema> = {};
  const shared: Record<string, ParsedSchema> = {};
  for (const [name, schema] of Object.entries(record)) {
    if (homes.get(name) === TOP_LEVEL) shared[name] = schema;
    else own[name] = schema;
  }
  return { group: processed, params, own, shared };
}
