import type { Directive, Expression, Program, Statement, VariableDeclaration } from "oxc-parser";

/**
 * The value a module's top-level `const` binds to a name: `const name = …`
 * or `export const name = …`. Only a `const` counts — a `let` or `var` may
 * be given another value before the config is read, so its first value says
 * nothing of what the config holds.
 *
 * @param program - The parsed module
 * @param name - The name bound
 * @returns The expression it is bound to, or `null` when no top-level `const` binds it
 * @example
 * ```ts
 * // const config = defineConfig({ sources: { api } });
 * topLevelConst(program, "config")?.type; // → "CallExpression"
 * ```
 */
export function topLevelConst(program: Program, name: string): Expression | null {
  for (const statement of program.body) {
    const declaration = declarationOf(statement);
    if (declaration === null || declaration.kind !== "const") continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === "Identifier" && declarator.id.name === name) {
        return declarator.init;
      }
    }
  }
  return null;
}

function declarationOf(statement: Directive | Statement): VariableDeclaration | null {
  if (statement.type === "VariableDeclaration") return statement;
  if (statement.type !== "ExportNamedDeclaration") return null;
  return statement.declaration?.type === "VariableDeclaration" ? statement.declaration : null;
}
