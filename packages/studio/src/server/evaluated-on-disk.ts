import { createLogger } from "@noverax/courier";
import { contentHashOf } from "./file-content-hash";
import { evaluatedTextHash } from "./observed-transforms";
import { readWatchedBytes } from "./read-watched-bytes";

const log = createLogger("Studio");

/**
 * Whether a file holds, now, the text a load evaluated from it: its bytes,
 * read as UTF-8 as the loader reads them, have the hash the load noted.
 *
 * Comparing the text rather than the bytes keeps a file that is not valid
 * UTF-8 from looking changed forever: the loader evaluates what decoding
 * leaves of it, and so does this.
 *
 * @param path - The file
 * @param evaluated - The hash of the text the load evaluated, from `observedTransforms`
 * @returns Whether it holds that text; `false` when it is gone or cannot be read
 * @example
 * ```ts
 * holdsEvaluatedText("/app/src/api.ts", loaded.evaluated.get("/app/src/api.ts") ?? "");
 * ```
 */
export function holdsEvaluatedText(path: string, evaluated: string): boolean {
  try {
    const bytes = readWatchedBytes(path);
    return bytes !== null && evaluatedTextHash(bytes.toString("utf8")) === evaluated;
  } catch (error) {
    log.debug(`Could not read ${path} to compare it with what Studio runs`, error);
    return false;
  }
}

/**
 * Whether a load evaluated a file from other bytes than the ones it read
 * before evaluating — a save landed in between — rather than the same bytes
 * read as text: what the hashes alone cannot tell apart for a file that is
 * not valid UTF-8, whose text hashes otherwise than its bytes.
 *
 * @param path - The file
 * @param read - The hash of the bytes the load read before evaluating
 * @param evaluated - The hash of the text it evaluated
 * @returns Whether what it evaluated is not what it read
 * @example
 * ```ts
 * evaluatedOtherBytes(path, loaded.depHashes.get(path) ?? null, loaded.evaluated.get(path) ?? "");
 * ```
 */
export function evaluatedOtherBytes(path: string, read: string, evaluated: string): boolean {
  if (read === evaluated) return false;
  return !(contentHashOf(path) === read && holdsEvaluatedText(path, evaluated));
}
