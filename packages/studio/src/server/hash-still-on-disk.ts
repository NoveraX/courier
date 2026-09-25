import { contentHashOf, UNREADABLE } from "./file-content-hash";

/**
 * The hash of the bytes a load read before evaluating a file, provided the
 * file still holds them once the evaluation is over.
 *
 * When it does not, what was evaluated may be either version, so its hash is
 * unknown.
 *
 * @param file - The file that was evaluated
 * @param before - The hash taken before evaluating it; `null` or `undefined`
 *   when it was absent or not read
 * @returns `before`, or `null` when the file changed, was absent or could not
 *   be read
 * @example
 * ```ts
 * const contentHash = hashStillOnDisk(configFile, inputs.get(configFile));
 * ```
 */
export function hashStillOnDisk(file: string, before: string | null | undefined): string | null {
  if (before === null || before === undefined || before === UNREADABLE) return null;
  return contentHashOf(file) === before ? before : null;
}
