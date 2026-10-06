/**
 * Generates the barrel index file (the direct caller + schema re-exports).
 */

import type { ParsedGroup, ParsedSpec } from "../parser/types";
import { barrelReexports } from "./barrel-reexports";
import { callerDoc } from "./caller-doc";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/**
 * Write the import's barrel: the direct caller, when the import has one,
 * and the re-exports of its schemas and types. The proxy caller is in a
 * module of its own (see `generateProxyFile`), so browser code importing it
 * gets neither the source nor the schemas the barrel brings with it. With
 * no direct caller the source is not imported at all: nothing would read it.
 *
 * @param spec - The parsed specification
 * @param groups - The groups, in order; none for an import generated flat
 * @param options - The import's resolved options
 * @param schemaModules - The text of each written schemas file, by group; `""` for a flat import
 * @returns The barrel
 * @example
 * ```ts
 * generateIndexFile(spec, spec.groups, options, schemaModules).path; // "src/api/pets/index.ts"
 * ```
 */
export function generateIndexFile(
  spec: ParsedSpec,
  groups: ParsedGroup[],
  options: ResolvedGenerateOptions,
  schemaModules: ReadonlyMap<string, string>,
): GeneratedFile {
  const name = options.sourceName;
  const lines: string[] = [];
  if (options.generateClient === "direct" || options.generateClient === "both") {
    lines.push(
      'import { createCaller } from "@noverax/courier";',
      `import { ${name} } from "./source${options.importExtension}";`,
      "",
      ...callerDoc(spec, "DIRECT"),
      `export const ${name}Api = createCaller(${name});`,
      "",
    );
  }
  lines.push(...barrelReexports(groups, options, schemaModules), "");
  return { path: options.layout.indexFile, content: lines.join("\n") };
}
