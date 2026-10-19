import { posix } from "node:path";
import { toCamelCase } from "../parser/naming-utils";
import { canonicalOutputDir } from "./canonical-output-dir";
import { directoryName } from "./directory-name";
import type { ImportPlacement } from "./import-layout";

/* The names 0.3.0 bound a source by as they are, which a module cannot bind as its own. */
const RENAMED_BINDINGS: ReadonlySet<string> = new Set([
  "arguments",
  "eval",
  "globalThis",
  "undefined",
]);

/** The binding an import's source is exported under, and the directory its files are in. */
export interface PlacedSource {
  readonly binding: string;
  readonly dir: string;
}

/**
 * Where Courier Studio 0.3.0 put an import's files when this release puts
 * them elsewhere. 0.3.0 bound a source named `eval`, `arguments`,
 * `undefined` or `globalThis` by that very name, in a folder of that name;
 * this release binds it as a reserved word's is, `evalGroup` in
 * `eval-group/`. Every other import goes where it went.
 *
 * @param placement - The import's `outputDir` and `sourceName`, a layout Studio already accepted
 * @param importName - The import's key under `imports`
 * @returns The binding and directory 0.3.0 gave it, or `undefined` when this release gives the same
 * @example
 * ```ts
 * formerPlacement({ outputDir: "./src/api" }, "globalThis");
 * // → { binding: "globalThis", dir: "src/api/global-this" }
 * ```
 */
export function formerPlacement(
  placement: ImportPlacement,
  importName: string,
): PlacedSource | undefined {
  const binding = toCamelCase(placement.sourceName ?? importName);
  if (!RENAMED_BINDINGS.has(binding)) return undefined;
  const dir = posix.join(canonicalOutputDir(placement.outputDir), directoryName(binding));
  return { binding, dir };
}
