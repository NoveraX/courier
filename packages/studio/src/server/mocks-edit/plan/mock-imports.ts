import type { Expression, ImportDeclaration, Program } from "oxc-parser";
import { MOCK_PACKAGE, MOCK_PACKAGE_MANAGED } from "../mock-package";
import { exportName } from "./export-name";
import { isValueImport, isValueSpecifier } from "./is-value-import";
import { unwrapExpression } from "./unwrap-expression";

/* Both entries export both functions. */
const MOCK_ENTRIES: ReadonlySet<string> = new Set([MOCK_PACKAGE, MOCK_PACKAGE_MANAGED]);

/** What a module imports, as values, from the mock package. */
export interface MockImports {
  /** Local names by the name imported, in source order. */
  named: ReadonlyMap<string, readonly string[]>;
  /** Local names of namespace imports. */
  namespaces: readonly string[];
  /** The first value import of the package root with only named specifiers, which new names can join. */
  joinable: ImportDeclaration | null;
}

/**
 * Read the value imports a module takes from either mock entry.
 *
 * @param program - The parsed module
 * @returns The functions it imports, the namespaces, and an import new names can join
 *
 * @example
 * ```ts
 * // import { defineMocks as dm } from "@noverax/courier-mock";
 * readMockImports(program).named.get("defineMocks"); // → ["dm"]
 * ```
 */
export function readMockImports(program: Program): MockImports {
  const named = new Map<string, string[]>();
  const namespaces: string[] = [];
  let joinable: ImportDeclaration | null = null;
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration" || !isValueImport(statement)) continue;
    if (!MOCK_ENTRIES.has(statement.source.value)) continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportNamespaceSpecifier") namespaces.push(specifier.local.name);
      if (specifier.type !== "ImportSpecifier" || !isValueSpecifier(specifier)) continue;
      const imported = exportName(specifier.imported);
      named.set(imported, [...(named.get(imported) ?? []), specifier.local.name]);
    }
    if (joinable === null && canJoin(statement)) joinable = statement;
  }
  return { named, namespaces, joinable };
}

/**
 * Whether a callee refers to a function the mock package exports: a local
 * name it was imported under, or `namespace.name`.
 *
 * @param callee - The callee of a call expression
 * @param name - `defineMocks` or `defineMockServer`
 * @param imports - What the module imports from the mock package
 * @returns Whether calling `callee` calls that function
 *
 * @example
 * ```ts
 * // import * as mock from "@noverax/courier-mock";  …  mock.defineMockServer({ … })
 * isMockCallee(call.callee, "defineMockServer", imports); // → true
 * ```
 */
export function isMockCallee(callee: Expression, name: string, imports: MockImports): boolean {
  const target = unwrapExpression(callee);
  if (target.type === "Identifier") return imports.named.get(name)?.includes(target.name) ?? false;
  if (target.type !== "MemberExpression" || target.computed || target.optional) return false;
  if (target.object.type !== "Identifier" || target.property.type !== "Identifier") return false;
  return target.property.name === name && imports.namespaces.includes(target.object.name);
}

function canJoin(declaration: ImportDeclaration): boolean {
  if (declaration.source.value !== MOCK_PACKAGE) return false;
  const { specifiers } = declaration;
  return specifiers.length > 0 && specifiers.every((s) => s.type === "ImportSpecifier");
}
