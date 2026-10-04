import type { ImportDeclarationSpecifier } from "oxc-parser";

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
