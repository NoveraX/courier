import { realpathSync } from "node:fs";
import { findMocksFile, readMocksExport } from "@noverax/courier-studio-core/config";
import { errnoCode } from "./errno-code";
import type { EvaluatedCourierFiles } from "./evaluate-courier-files";
import { UNREADABLE } from "./file-content-hash";
import { hashStillOnDisk } from "./hash-still-on-disk";
import { fingerprintLoadedMocks } from "./mock-fingerprints";
import type { ProjectInputs } from "./read-project-inputs";
import { readWatchedBytes } from "./read-watched-bytes";

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

/** Where the mocks file is, found before anything is read. */
export interface FoundCourierMocks {
  /** The path as found in the project root; `null` when there is none. */
  path: string | null;
  /** The path with links resolved; `null` when absent or a link to nothing. */
  file: string | null;
}

/** The mocks file as the load read it before evaluating anything. */
export interface LocatedCourierMocks extends FoundCourierMocks {
  /** sha256 of the bytes read before loading, compared afterwards. */
  hashBefore: string | null;
  /** Why the file cannot be read, when it cannot; it is then not loaded. */
  unreadable: unknown | null;
}

/**
 * Find `courier.mocks.*` in the project root, without reading it.
 *
 * @param root - The project root, symlinks resolved
 * @returns The file's path as found and as resolved
 * @example
 * ```ts
 * const found = findCourierMocks(root);
 * ```
 */
export function findCourierMocks(root: string): FoundCourierMocks {
  const path = findMocksFile(root);
  return { path, file: path === null ? null : realpathIfPresent(path) };
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

function realpathIfPresent(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return null;
    throw err;
  }
}
