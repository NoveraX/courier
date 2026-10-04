import type { ImportDeclaration, Program } from "oxc-parser";
import { MOCK_PACKAGE, MOCK_PACKAGE_MANAGED } from "../mock-package";
import { exportName } from "./export-name";
import { isValueImport } from "./is-value-import";
import { isValueSpecifier } from "./is-value-specifier";

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

function canJoin(declaration: ImportDeclaration): boolean {
  if (declaration.source.value !== MOCK_PACKAGE) return false;
  const { specifiers } = declaration;
  return specifiers.length > 0 && specifiers.every((s) => s.type === "ImportSpecifier");
}
