import { realpathSync } from "node:fs";
import { errnoCode } from "@noverax/courier-cli/devkit";
import { findMocksFile } from "@noverax/courier-studio-core/config";

/** Where the mocks file is, found before anything is read. */
export interface FoundCourierMocks {
  /** The path as found in the project root; `null` when there is none. */
  path: string | null;
  /** The path with links resolved; `null` when absent or a link to nothing. */
  file: string | null;
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

function realpathIfPresent(path: string): string | null {
  try {
    return realpathSync(path);
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return null;
    throw err;
  }
}
