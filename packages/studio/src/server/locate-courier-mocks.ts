import { UNREADABLE } from "./file-content-hash";
import type { FoundCourierMocks } from "./find-courier-mocks";
import type { ProjectInputs } from "./read-project-inputs";
import { readWatchedBytes } from "./read-watched-bytes";

/** The mocks file as the load read it before evaluating anything. */
export interface LocatedCourierMocks extends FoundCourierMocks {
  /** sha256 of the bytes read before loading, compared afterwards. */
  hashBefore: string | null;
  /** Why the file cannot be read, when it cannot; it is then not loaded. */
  unreadable: unknown | null;
}

/**
 * Take the mocks file as the load's one read before evaluating found it: the
 * hash that read recorded is the one the loaded file is compared with, so no
 * save can fall between two reads and go unnoticed.
 *
 * @param found - What {@link findCourierMocks} found
 * @param inputs - What the load read before evaluating, the mocks file among it
 * @returns The file with the hash read, or why it cannot be read
 * @example
 * ```ts
 * const mocks = locateCourierMocks(found, readProjectInputs(names, configFile, found.file));
 * ```
 */
export function locateCourierMocks(
  found: FoundCourierMocks,
  inputs: ProjectInputs,
): LocatedCourierMocks {
  if (found.file === null) return { ...found, hashBefore: null, unreadable: null };
  const hashBefore = inputs.get(found.file) ?? null;
  if (hashBefore !== UNREADABLE) return { ...found, hashBefore, unreadable: null };
  return { ...found, hashBefore: null, unreadable: whyUnreadable(found.file) };
}

/* The read before the load failed; reading once more tells why. The file is
   not evaluated either way, and a read that now succeeds means it changed. */
function whyUnreadable(file: string): unknown {
  try {
    readWatchedBytes(file);
  } catch (error) {
    return error;
  }
  return new Error("it changed while Studio was reading it");
}
