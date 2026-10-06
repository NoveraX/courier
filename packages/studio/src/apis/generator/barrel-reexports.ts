/**
 * The lines a barrel re-exports the import's schemas and types with.
 */

import type { ParsedGroup } from "../parser/types";
import { declaredExports } from "./declared-exports";
import { namedStatement } from "./named-statement";
import type { ResolvedGenerateOptions } from "./types";

/**
 * Re-export every schema and type the import declares by name, each name
 * once: a module's names no earlier module exports, read from the module as
 * it was written. A name is a type where the module declares only a type.
 *
 * By name rather than `export *`, which linters reject: it hides from the
 * reader and the bundler what the barrel exports, and lets two modules
 * export one name. The file's name follows `generateSchemas` alone:
 * `validation: "none"` still writes schemas.ts, and re-exporting a `types`
 * file nobody generated failed.
 *
 * @param groups - The groups, in order; none for an import generated flat
 * @param options - The import's resolved options
 * @param schemaModules - The text of each written schemas file, by group; `""` for a flat import
 * @returns The re-export statements
 * @example
 * ```ts
 * barrelReexports(spec.groups, options, schemaModules);
 * // ['export { type Pet, PetSchema } from "./pets/schemas";']
 * ```
 */
export function barrelReexports(
  groups: readonly ParsedGroup[],
  options: ResolvedGenerateOptions,
  schemaModules: ReadonlyMap<string, string>,
): string[] {
  const file = options.generateSchemas ? "schemas" : "types";
  const extension = options.importExtension;
  const modules =
    groups.length === 0
      ? [...schemaModules.values()].map((text) => ({ from: `./${file}${extension}`, text }))
      : groups.flatMap((group) => {
          const text = schemaModules.get(group.name);
          const from = `${options.layout.groupSpecifier(group.name, file)}${extension}`;
          return text === undefined ? [] : [{ from, text }];
        });

  const exported = new Set<string>();
  return modules.flatMap(({ from, text }) => {
    const fresh = [...declaredExports(text)].filter(([name]) => !exported.has(name));
    for (const [name] of fresh) exported.add(name);
    if (fresh.length === 0) return [];
    /* A module of types alone is re-exported with `export type`, as linters ask. */
    if (fresh.every(([, kind]) => kind === "type")) {
      return [
        namedStatement(
          "export type",
          fresh.map(([name]) => name),
          from,
        ),
      ];
    }
    const names = fresh.map(([name, kind]) => (kind === "type" ? `type ${name}` : name));
    return [namedStatement("export", names, from)];
  });
}
