import type { ImportDeclaration } from "../../server/write-types";

/**
 * The lines the config declares the import with: the import of its
 * generated source and its `sources` entry, while `sources` does not
 * declare it, and its `imports` entry, while `imports` does not name it —
 * each under the file it goes in, when the config takes its `sources`
 * from a module of its own.
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
  const { source, importEntry, sourcesFile, configFile } = declaration;
  const into = (file: string) => (sourcesFile ? [`  in ${file}:`] : []);
  return [
    ...(source
      ? [
          ...into(sourcesFile ?? configFile),
          `  ${source.importLine}`,
          `  under sources:  ${source.entry.trim()}`,
        ]
      : []),
    ...(importEntry === undefined
      ? []
      : [
          ...into(configFile),
          "  under imports:",
          ...importEntry.split("\n").map((line) => `  ${line}`),
        ]),
  ];
}
