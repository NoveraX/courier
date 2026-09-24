import type { ModuleExportName } from "oxc-parser";

/**
 * The name a specifier imports or exports, whether written as an
 * identifier or, as ES2022 allows, a string.
 *
 * @param name - The specifier's `imported`, `local` or `exported` side
 * @returns The name it refers to
 *
 * @example
 * ```ts
 * // export { mocks as "default" };
 * exportName(specifier.exported); // → "default"
 * ```
 */
export function exportName(name: ModuleExportName): string {
  return name.type === "Identifier" ? name.name : name.value;
}
