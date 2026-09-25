import { contentHashOf } from "./file-content-hash";
import type { ProjectInputs } from "./read-project-inputs";

/**
 * Whether every file a load read still holds what it read: the same bytes,
 * still absent, or still unreadable. When one does not, a load made now
 * would read something else.
 *
 * @param inputs - What the load read, with the hash of each file
 * @returns `true` when nothing it read has changed on disk since
 *
 * @example
 * ```ts
 * if (inputsOnDisk(loaded.depHashes)) apply(loaded);
 * ```
 */
export function inputsOnDisk(inputs: ProjectInputs): boolean {
  for (const [path, hash] of inputs) {
    if (contentHashOf(path) !== hash) return false;
  }
  return true;
}
