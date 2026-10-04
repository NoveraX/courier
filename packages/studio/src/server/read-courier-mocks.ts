import { readMocksExport } from "@noverax/courier-studio-core/config";
import type { EvaluatedCourierFiles } from "./evaluate-courier-files";
import { hashStillOnDisk } from "./hash-still-on-disk";
import type { LocatedCourierMocks } from "./locate-courier-mocks";
import { fingerprintLoadedMocks } from "./mock-fingerprints";

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
  /**
   * A fingerprint of each mock's declaration and what it uses, by key, read
   * from the file as the load found it; absent when the file did not load or
   * Studio cannot tell its declarations apart. See `fingerprintMocks`.
   */
  fingerprints?: ReadonlyMap<string, string>;
}

/**
 * Read the mocks a load produced. A mocks file that did not load, or that
 * exports the wrong thing, yields no entries and says why, so the config it
 * sits beside keeps working.
 *
 * @param located - What {@link locateCourierMocks} found before the load
 * @param evaluated - What loading the config and the mocks file produced
 * @returns The mocks Studio runs, or the reason it has none
 * @example
 * ```ts
 * const mocks = readCourierMocks(located, await evaluateCourierFiles(configFile, located.file, cache));
 * ```
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
  const contentHash = hashStillOnDisk(file, hashBefore);
  if (evaluated.mocksError !== null)
    return { file, entries: {}, contentHash, error: evaluated.mocksError };
  const fingerprints = fingerprintLoadedMocks(file, contentHash);
  try {
    return {
      file,
      entries: readMocksExport(evaluated.mocksNamespace, file),
      contentHash,
      error: null,
      ...(fingerprints && { fingerprints }),
    };
  } catch (error) {
    return { file, entries: {}, contentHash, error };
  }
}
