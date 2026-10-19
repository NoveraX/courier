import type { ImportDeclaration, ImportSpecifier, Program } from "oxc-parser";
import type { ModuleBindings } from "../../server/mocks-edit/plan/module-bindings";
import { freeName } from "../generator/module-local-names";
import type { SourceGroupImport } from "./update-source-file";

/** A group to add, the name the file reaches it by, and whether the file imports it so already. */
export interface PlacedGroupImport extends SourceGroupImport {
  readonly imported: boolean;
}

/**
 * The name each group to add is reached by in a file: the one asked for
 * when the file imports that very group under it, or binds nothing of that
 * name; otherwise the first numbered name the file leaves free. A group was
 * listed under a name the file bound to something else, and so wired to it.
 *
 * @param program - The file, parsed
 * @param bindings - Every name the file binds
 * @param groups - The groups to add, each with the name it asks for
 * @returns Each group with the name it is reached by
 * @example
 * ```ts
 * placedGroupImports(program, bindings, [{ name: "pets", local: "petsGroup", importPath: "../pets/index" }]);
 * // → local "petsGroup_2" in a file declaring petsGroup itself
 * ```
 */
export function placedGroupImports(
  program: Program,
  bindings: ModuleBindings,
  groups: readonly SourceGroupImport[],
): PlacedGroupImport[] {
  const taken = new Set(bindings.keys());
  return groups.map((group) => {
    if (bindings.has(group.local) && importsGroup(program, group))
      return { ...group, imported: true };
    const local = freeName(group.local, taken);
    taken.add(local);
    return { ...group, local, imported: false };
  });
}

/* Whether the file imports the group, from its module, under that name. */
function importsGroup(program: Program, group: SourceGroupImport): boolean {
  return program.body.some(
    (statement) =>
      statement.type === "ImportDeclaration" &&
      statement.source.value === group.importPath &&
      specifiersOf(statement).some(
        (specifier) =>
          specifier.local.name === group.local && importedName(specifier) === group.name,
      ),
  );
}

function specifiersOf(statement: ImportDeclaration): ImportSpecifier[] {
  return statement.specifiers.filter((specifier) => specifier.type === "ImportSpecifier");
}

function importedName(specifier: ImportSpecifier): string {
  return specifier.imported.type === "Identifier"
    ? specifier.imported.name
    : specifier.imported.value;
}
