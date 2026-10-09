import type { ImportDeclaration } from "../../server/write-types";

/**
 * The lines the config declares the import with: the import of its
 * generated source and its `sources` entry, while `sources` does not
 * declare it, and its `imports` entry, while `imports` does not name it.
 *
 * @param declaration - What the config must still declare
 * @returns The lines, indented under a heading the caller writes
 * @example
 * ```ts
 * declarationLines(plan.declaration);
 * // ['  import { pets } from "./src/api/pets/source";', "  under sources:  pets,", …]
 * ```
 */
export function declarationLines(declaration: ImportDeclaration): string[] {
  const { source, importEntry } = declaration;
  return [
    ...(source ? [`  ${source.importLine}`, `  under sources:  ${source.entry.trim()}`] : []),
    ...(importEntry === undefined
      ? []
      : ["  under imports:", ...importEntry.split("\n").map((line) => `  ${line}`)]),
  ];
}
