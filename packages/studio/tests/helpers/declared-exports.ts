import type { DeclaredKind } from "../../src/apis/generator/declared-in-lines";
import { parseSource } from "../../src/server/mocks-edit/plan/parse-source";

/**
 * The names a module exports, read from its syntax: its `export const` and
 * `export type` declarations, in the order it declares them, each a value or
 * only a type, a name declared as both being a value. What the generator
 * records of its own declarations as it writes a module is checked against
 * this: a test parses the module the generator wrote, the generator does
 * not.
 *
 * @param content - The module's text
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
