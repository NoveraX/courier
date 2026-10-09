import type { Expression, ModuleExportName, Program } from "oxc-parser";

import type { SourceModules } from "./source-modules";

/** An expression, and the module it is written in. */
export interface Placed {
  readonly path: string;
  readonly node: Expression;
}

/* Follows this many imports at most: a chain longer than any a project writes is a cycle. */
const MOST_HOPS = 16;

/**
 * The expression a name is bound to at a module's top level — a `const`
 * the module declares, or one it imports from another of the project's
 * modules, followed through its re-exports — in the module that writes it.
 *
 * @param modules - The project's modules
 * @param path - The module the name is used in
 * @param name - The name
 * @returns The expression and where it is written, or `undefined` when the
 *   name is bound to none Studio can read: a parameter, a package's export,
 *   a value computed at run time
 * @example
 * ```ts
 * boundValue(modules, "/app/src/api/shop-catalog.ts", "Product");
 * // { path: "/app/src/api/schemas.ts", node: <z.object({…})> }
 * ```
 */
export function boundValue(modules: SourceModules, path: string, name: string): Placed | undefined {
  return localOrImported(modules, path, name, 0);
}

function localOrImported(
  modules: SourceModules,
  path: string,
  name: string,
  hops: number,
): Placed | undefined {
  const program = modules.module(path)?.program;
  if (program === undefined || hops > MOST_HOPS) return undefined;
  const local = declared(program, name);
  if (local !== undefined) return { path, node: local };
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    for (const specifier of statement.specifiers) {
      if (specifier.local.name !== name || specifier.type === "ImportNamespaceSpecifier") continue;
      const from = modules.imported(path, statement.source.value);
      if (from === undefined) return undefined;
      const exported =
        specifier.type === "ImportSpecifier" ? nameOf(specifier.imported) : "default";
      return exportedValue(modules, from, exported, hops + 1);
    }
  }
  return undefined;
}

/* What a module exports under a name: its own binding, a default, or another module's, re-exported. */
function exportedValue(
  modules: SourceModules,
  path: string,
  exported: string,
  hops: number,
): Placed | undefined {
  const program = modules.module(path)?.program;
  if (program === undefined || hops > MOST_HOPS) return undefined;
  for (const statement of program.body) {
    if (exported === "default" && statement.type === "ExportDefaultDeclaration") {
      const value = statement.declaration;
      if (value.type === "Identifier") return localOrImported(modules, path, value.name, hops);
      return isExpression(value) ? { path, node: value } : undefined;
    }
    if (statement.type !== "ExportNamedDeclaration") continue;
    for (const specifier of statement.specifiers) {
      if (nameOf(specifier.exported) !== exported) continue;
      const local = nameOf(specifier.local);
      if (statement.source === null) return localOrImported(modules, path, local, hops);
      const from = modules.imported(path, statement.source.value);
      return from === undefined ? undefined : exportedValue(modules, from, local, hops + 1);
    }
  }
  const own = declared(program, exported);
  if (own !== undefined) return { path, node: own };
  for (const statement of program.body) {
    if (statement.type !== "ExportAllDeclaration" || statement.exported !== null) continue;
    const from = modules.imported(path, statement.source.value);
    const found = from === undefined ? undefined : exportedValue(modules, from, exported, hops + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/* A `const` (or `let`, `var`) the module declares at its top level, exported or not. */
function declared(program: Program, name: string): Expression | undefined {
  for (const statement of program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement;
    if (declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of declaration.declarations) {
      if (declarator.id.type === "Identifier" && declarator.id.name === name && declarator.init) {
        return declarator.init;
      }
    }
  }
  return undefined;
}

function nameOf(name: ModuleExportName): string {
  return name.type === "Literal" ? String(name.value) : name.name;
}

function isExpression(value: { type: string }): value is Expression {
  return !/Declaration$/.test(value.type) && value.type !== "ClassDeclaration";
}
