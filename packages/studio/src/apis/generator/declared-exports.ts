import { parseSource } from "../../server/mocks-edit/plan/parse-source";

/** Whether a name a generated module exports is a value, or only a type. */
export type DeclaredKind = "value" | "type";

/**
 * The names a generated schemas or types module exports, in the order it
 * declares them, each a value or only a type: its `export const` and
 * `export type` declarations, read from the module's syntax. A description
 * the specification wrote into a doc comment may hold a line reading
 * `export const X`, which a barrel re-exporting it would name though the
 * module declares no such thing. A name declared as both a value and a type
 * is a value, which a re-export by name carries with its type.
 *
 * @param content - The module the generator wrote
 * @returns Each exported name and its kind
 * @example
 * ```ts
 * declaredExports("export type Pet = { id: number };\nexport const PetSchema = z.object({});\n");
 * // → Map { "Pet" => "type", "PetSchema" => "value" }
 * ```
 */
export function declaredExports(content: string): Map<string, DeclaredKind> {
  const names = new Map<string, DeclaredKind>();
  for (const statement of parseSource("module.ts", content).program.body) {
    if (statement.type !== "ExportNamedDeclaration") continue;
    const { declaration } = statement;
    if (declaration?.type === "TSTypeAliasDeclaration") {
      if (!names.has(declaration.id.name)) names.set(declaration.id.name, "type");
    } else if (declaration?.type === "VariableDeclaration" && declaration.kind === "const") {
      for (const { id } of declaration.declarations) {
        if (id.type === "Identifier") names.set(id.name, "value");
      }
    }
  }
  return names;
}
