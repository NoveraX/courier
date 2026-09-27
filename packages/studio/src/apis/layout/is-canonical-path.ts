import { canonicalOutputDir } from "./canonical-output-dir";
import { InvalidImportError } from "./invalid-import-error";

/**
 * Tell whether a project-relative path is spelled as Studio writes them:
 * `/`-separated, normalized, inside the project, in no folder off limits
 * and with no name Windows reads differently.
 *
 * @param path - The path
 * @returns Whether it is canonical
 * @example
 * ```ts
 * isCanonicalPath("src/api/pets/index.ts"); // true
 * isCanonicalPath("./src/../.git/config"); // false
 * ```
 */
export function isCanonicalPath(path: string): boolean {
  try {
    return canonicalOutputDir(path) === path;
  } catch (error) {
    if (error instanceof InvalidImportError) return false;
    throw error;
  }
}
