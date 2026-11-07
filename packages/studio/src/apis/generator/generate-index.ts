/**
 * Generates the barrel index file (the direct caller + schema re-exports).
 */

import type { ParsedSpec } from "../parser/types";
import { barrelReexports } from "./barrel-reexports";
import { callerDoc } from "./caller-doc";
import type { DeclaredKind } from "./declared-in-lines";
import type { GeneratedFile, ResolvedGenerateOptions } from "./types";

/**
 * Write the import's barrel: the direct caller, when the import has one,
 * and the re-exports of its schemas and types. The proxy caller is in a
 * module of its own (see `generateProxyFile`), so browser code importing it
 * gets neither the source nor the schemas the barrel brings with it. With
 * no direct caller the source is not imported at all: nothing would read it.
 * The direct caller is the server's, the one the root gives, and comes from
 * the server's entry, `@noverax/courier/server`; where a page alone loads
 * the barrel, in a project with no server side, it is a page's, from the
 * page's entry, `@noverax/courier/client`, so the page's bundle holds none
 * of the server's part. Written from the root, the barrel would be moved by
 * the upgrade that takes the root's imports to the entries, which asks that
 * a file Studio wrote be written again instead. The caller is made pure, so
 * a module that takes a schema of the barrel and not the caller — a page's
 * among them — carries no caller, nor the server's part it comes with.
 *
 * @param spec - The parsed specification
 * @param options - The import's resolved options
 * @param schemaModules - What each written schemas file exports, by group; under `""` the import's own
 * @returns The barrel
 * @example
 * ```ts
 * generateIndexFile(spec, options, schemaModules).path; // "src/api/pets/index.ts"
 * ```
 */
export function generateIndexFile(
  spec: ParsedSpec,
  options: ResolvedGenerateOptions,
  schemaModules: ReadonlyMap<string, ReadonlyMap<string, DeclaredKind>>,
): GeneratedFile {
  const name = options.sourceName;
  const lines: string[] = [];
  if (options.generateClient === "direct" || options.generateClient === "both") {
    const entry = options.pageOnly ? "@noverax/courier/client" : "@noverax/courier/server";
    lines.push(
      `import { createCaller } from "${entry}";`,
      `import { ${name} } from "./source${options.importExtension}";`,
      "",
      ...callerDoc(spec, "DIRECT"),
      `export const ${name}Api = /* @__PURE__ */ createCaller(${name});`,
      "",
    );
  }
  lines.push(...barrelReexports(options, schemaModules), "");
  return { path: options.layout.indexFile, content: lines.join("\n") };
}
