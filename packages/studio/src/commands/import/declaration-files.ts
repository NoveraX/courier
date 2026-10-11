import type { ImportDeclaration } from "../../server/write-types";

/**
 * The files the lines that declare an import go in: the module the config
 * takes its `sources` from — or the config, when it writes the list itself —
 * for the source, and the config for the `imports` entry.
 *
 * @param declaration - What the config must still declare
 * @returns The files, each once, in the order the lines name them
 * @example
 * ```ts
 * declarationFiles({ configFile: "courier.config.ts", sourcesFile: "lib/sources.ts", source, importEntry });
 * // → ["lib/sources.ts", "courier.config.ts"]
 * ```
 */
export function declarationFiles(declaration: ImportDeclaration): string[] {
  const { configFile, sourcesFile, source, importEntry } = declaration;
  const files = [
    ...(source ? [sourcesFile ?? configFile] : []),
    ...(importEntry === undefined ? [] : [configFile]),
  ];
  return [...new Set(files)];
}
