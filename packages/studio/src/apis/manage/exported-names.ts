import type { Declaration, Program } from "oxc-parser";
import { exportName } from "../../server/mocks-edit/plan/export-name";

/** Whether a name a module exports is a value, or only a type. */
export type ExportedKind = "value" | "type";

/**
 * The names statements of a module export by name, each a value or only a
 * type: its exported declarations and export lists. A name exported as both
 * is a value, which re-exporting by name carries with its type.
 *
 * @param statements - The module's statements, or some of them
 * @returns Each exported name and its kind
 * @example
 * ```ts
 * exportedNames(parseSource("schemas.ts", "export const PetSchema = s;\nexport type Pet = {};").program.body);
 * // → Map { "PetSchema" => "value", "Pet" => "type" }
 * ```
 */
export function exportedNames(statements: Program["body"]): Map<string, ExportedKind> {
  const names = new Map<string, ExportedKind>();
  const add = (name: string, kind: ExportedKind): void => {
    if (names.get(name) !== "value") names.set(name, kind);
  };
  for (const statement of statements) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    if (statement.declaration !== null)
      for (const [name, kind] of declaredNames(statement.declaration)) add(name, kind);
    for (const specifier of statement.specifiers) {
      const typeOnly = statement.exportKind === "type" || specifier.exportKind === "type";
      add(exportName(specifier.exported), typeOnly ? "type" : "value");
    }
  }
  return names;
}

function declaredNames(declaration: Declaration): Array<[string, ExportedKind]> {
  switch (declaration.type) {
    case "VariableDeclaration":
      return declaration.declarations.flatMap(
        (declarator): Array<[string, ExportedKind]> =>
          declarator.id.type === "Identifier" ? [[declarator.id.name, "value"]] : [],
      );
    case "TSTypeAliasDeclaration":
    case "TSInterfaceDeclaration":
      return [[declaration.id.name, "type"]];
    case "FunctionDeclaration":
    case "ClassDeclaration":
    case "TSEnumDeclaration":
      return declaration.id === null ? [] : [[declaration.id.name, "value"]];
    default:
      return [];
  }
}
