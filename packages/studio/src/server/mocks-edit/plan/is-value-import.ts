import type { ImportDeclaration, ImportDeclarationSpecifier } from "oxc-parser";

/**
 * Whether an import declaration brings in runtime values: not `import type`,
 * and not a deferred or source-phase import. oxc leaves `importKind` unset
 * in JavaScript, where every import is a value import.
 *
 * @param declaration - An import declaration
 * @returns Whether its bindings can be called at runtime
 *
 * @example
 * ```ts
 * // import type { A } from "a";
 * isValueImport(declaration); // → false
 * ```
 */
export function isValueImport(declaration: ImportDeclaration): boolean {
  return declaration.importKind !== "type" && declaration.phase === null;
}

/**
 * Whether one specifier of a value import is itself a value: not written
 * `import { type x }`.
 *
 * @param specifier - A specifier of a value import
 * @returns Whether it binds a runtime value
 *
 * @example
 * ```ts
 * // import { type A, b } from "a";
 * declaration.specifiers.map(isValueSpecifier); // → [false, true]
 * ```
 */
export function isValueSpecifier(specifier: ImportDeclarationSpecifier): boolean {
  return specifier.type !== "ImportSpecifier" || specifier.importKind !== "type";
}
