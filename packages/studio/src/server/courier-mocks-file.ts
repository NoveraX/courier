import { realpathSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { findMocksFile, readMocksExport } from "@noverax/courier-studio-core/config";
import type { EvaluatedCourierFiles } from "./evaluate-courier-files";
import { hashFile } from "./file-hash";

const log = createLogger("Studio");

/** The project's `courier.mocks.*`, as far as it loaded. */
export interface LoadedCourierMocks {
  /** Absolute, symlink-resolved path of the file; `null` when the project declares no mocks. */
  file: string | null;
  /** The declared mocks by key, unchecked; empty when the file is absent or did not load. */
  entries: Record<string, unknown>;
  /** sha256 of the bytes that were loaded; `null` when absent or when the file changed while loading. */
  contentHash: string | null;
  /** Why the file did not load, while the config did; `null` when it loaded or is absent. */
  error: unknown | null;
}

/** Where the mocks file is, found before anything is loaded. */
export interface LocatedCourierMocks {
  /** The path as found in the project root; `null` when there is none. */
  path: string | null;
  /** The path with links resolved; `null` when absent or a link to nothing. */
  file: string | null;
  /** sha256 of the bytes before loading, compared afterwards. */
  hashBefore: string | null;
  /** Why the file cannot be read, when it cannot; it is then not loaded. */
  unreadable: unknown | null;
}

/**
 * Find `courier.mocks.*` in the project root and hash it, before loading.
 *
 * @param root - The project root, symlinks resolved
 * @returns The file's path as found and as resolved, and its hash
 */
export function locateCourierMocks(root: string): LocatedCourierMocks {
  const path = findMocksFile(root);
  const file = path === null ? null : realpathIfPresent(path);
  if (file === null) return { path, file, hashBefore: null, unreadable: null };
  try {
    return { path, file, hashBefore: hashFile(file), unreadable: null };
  } catch (unreadable) {
    return { path, file, hashBefore: null, unreadable };
  }
}

/**
 * Read the mocks a load produced. A mocks file that did not load, or that
 * exports the wrong thing, yields no entries and says why, so the config it
 * sits beside keeps working.
 *
 * @param located - What {@link locateCourierMocks} found before the load
 * @param evaluated - What loading the config and the mocks file produced
 * @returns The mocks Studio runs, or the reason it has none
 */
export function readCourierMocks(
  located: LocatedCourierMocks,
  evaluated: EvaluatedCourierFiles,
): LoadedCourierMocks {
  const { path, file, hashBefore, unreadable } = located;
  if (path === null) return { file: null, entries: {}, contentHash: null, error: null };
  if (file === null) {
    const error = new Error(`${path} is a link to a file that does not exist`);
    return { file: path, entries: {}, contentHash: null, error };
  }
  if (unreadable !== null) {
    const reason = unreadable instanceof Error ? unreadable.message : String(unreadable);
    return {
      file,
      entries: {},
      contentHash: null,
      error: new Error(`${file} cannot be read: ${reason}`, { cause: unreadable }),
    };
  }
  const contentHash =
    hashBefore !== null && hashIfReadable(file) === hashBefore ? hashBefore : null;
  if (evaluated.mocksError !== null)
    return { file, entries: {}, contentHash, error: evaluated.mocksError };
  try {
    return {
      file,
      entries: readMocksExport(evaluated.mocksNamespace, file),
      contentHash,
      error: null,
    };
  } catch (error) {
    return { file, entries: {}, contentHash, error };
  }
}

/* Only compared with the hash taken before the load: a file that turned
   unreadable meanwhile has changed, and its hash is then unknown. */
function hashIfReadable(file: string): string | null {
  try {
    return hashFile(file);
  } catch (error) {
    log.debug(`${file} could not be read again after it loaded`, error);
    return null;
  }
}

function realpathIfPresent(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
