import { join } from "node:path";
import type { LoadedCourierConfig } from "./config-loader";

/**
 * Which of some project files a loaded config read as it loaded: imported
 * directly, or through another module it imports.
 *
 * @param loaded - The config as it loaded
 * @param root - The project root, symlinks resolved
 * @param paths - The files, project-relative
 * @returns Those of them the config read, in the order given
 * @example
 * ```ts
 * configReads(running, root, ["src/api/pets/source.ts", "src/api/pets/index.ts"]);
 * // → ["src/api/pets/source.ts"]
 * ```
 */
export function configReads(
  loaded: LoadedCourierConfig,
  root: string,
  paths: readonly string[],
): string[] {
  return paths.filter((path) => (loaded.depHashes.get(join(root, path)) ?? null) !== null);
}
