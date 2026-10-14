import { join } from "node:path";
import { packageTypeOf, usesNodeResolution } from "@noverax/courier-cli/devkit";
import type { GenerateOptions } from "../apis";
import { type ImportLayout, resolveImportLayout } from "../apis/layout";

/**
 * The extension an import's generated files give their relative imports:
 * `.js` when the files are ES modules — `.ts` in a package of type module —
 * whose imports TypeScript resolves as Node does, `node16` or `nodenext`,
 * where an import naming no extension does not compile, and none anywhere
 * else, where a bundler finds the file by its name alone. The same rule
 * decides how the mock wizard writes its imports.
 *
 * @param root - The project root
 * @param layout - Where the import's files go
 * @returns `.js`, or `undefined` for no extension
 * @example
 * ```ts
 * // package.json: { "type": "module" }; tsconfig.json: { "compilerOptions": { "module": "NodeNext" } }
 * generatedImportExtension("/app", layout); // → ".js"
 * ```
 */
export function generatedImportExtension(root: string, layout: ImportLayout): ".js" | undefined {
  const esModule = packageTypeOf(join(root, layout.sourceFile)) === "module";
  return esModule && usesNodeResolution(join(root, layout.dir)) ? ".js" : undefined;
}

/**
 * Generation options with the extension the project's imports need, for an
 * import named by its `sourceName`, as the import wizard names it.
 *
 * @param options - The options a request carried
 * @param root - The project root
 * @returns The options, with `importExtension` when the project needs one
 * @throws {InvalidImportError} When the output directory or the name is refused
 * @example
 * ```ts
 * generateCode(spec, withImportExtension(options, "/app"));
 * ```
 */
export function withImportExtension(options: GenerateOptions, root: string): GenerateOptions {
  if (options.sourceName === undefined) return options;
  const importExtension = generatedImportExtension(
    root,
    resolveImportLayout(options, options.sourceName),
  );
  return importExtension ? { ...options, importExtension } : options;
}
