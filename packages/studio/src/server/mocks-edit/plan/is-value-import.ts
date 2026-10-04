import type { ImportDeclaration } from "oxc-parser";

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
