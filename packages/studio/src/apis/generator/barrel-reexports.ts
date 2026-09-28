/**
 * The lines a barrel re-exports the import's schemas and types with.
 */

import type { ParsedGroup } from "../parser/types";
import { emitsSchemas } from "./build-endpoint-helpers";
import type { ResolvedGenerateOptions } from "./types";

/**
 * Re-export every schema and type the import declares, each name once.
 *
 * A module whose names no earlier one exports is re-exported whole; one
 * sharing a name — a schema two groups both use — by the names still free.
 * The file's name follows `generateSchemas` alone: `validation: "none"`
 * still writes schemas.ts, and re-exporting a `types` file nobody generated
 * failed.
 *
 * @param groups - The groups, in order; none for an import generated flat
 * @param options - The import's resolved options
 * @param groupSchemaMap - The names each written schemas file declares, by group; `""` for a flat import
 * @returns The re-export lines
 * @example
 * ```ts
 * barrelReexports(spec.groups, options, schemaMap); // ['export * from "./pets/schemas";']
 * ```
 */
export function barrelReexports(
  groups: readonly ParsedGroup[],
  options: ResolvedGenerateOptions,
  groupSchemaMap: ReadonlyMap<string, ReadonlySet<string>>,
): string[] {
  const file = options.generateSchemas ? "schemas" : "types";
  const extension = options.importExtension;
  if (groups.length === 0) {
    return groupSchemaMap.size > 0 ? [`export * from "./${file}${extension}";`] : [];
  }

  const lines: string[] = [];
  const exported = new Set<string>();
  for (const group of groups) {
    const schemaNames = groupSchemaMap.get(group.name);
    if (!schemaNames) continue;
    const from = `${options.layout.groupSpecifier(group.name, file)}${extension}`;
    const unique = [...schemaNames].filter((n) => !exported.has(n));
    if (unique.length === schemaNames.size) lines.push(`export * from "${from}";`);
    else if (unique.length > 0) lines.push(...namedReexport(unique, from, options));
    for (const n of schemaNames) exported.add(n);
  }
  return lines;
}

function namedReexport(
  names: readonly string[],
  from: string,
  options: ResolvedGenerateOptions,
): string[] {
  const listed: string[] = [];
  for (const n of names) {
    /* A `XSchema` binding exists only when a validator wrote one. */
    if (emitsSchemas(options)) listed.push(`${n}Schema`);
    if (options.generateTypes) listed.push(`type ${n}`);
  }
  return listed.length > 0 ? [`export { ${listed.join(", ")} } from "${from}";`] : [];
}
