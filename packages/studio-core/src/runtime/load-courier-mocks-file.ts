import { realpathSync } from "node:fs";
import { type ConfigJitiOptions, importProjectFile } from "@noverax/courier-build/config";

import { readMocksExport } from "./read-mocks-export";

/** A `courier.mocks.*` file that was loaded, and the mocks it declares. */
export interface LoadedCourierMocks {
  /** The declared mocks by key, unchecked: whatever the user wrote under each. */
  mocks: Record<string, unknown>;
  /** Absolute, symlink-resolved path of the file. */
  mocksFile: string;
}

/**
 * Load a `courier.mocks.*` file on its own, with the config's loader — what a
 * managed mock's worker does to read the one mock it serves.
 *
 * Only Studio reads this file: the mocks are kept out of `courier.config.*`
 * because that file is also loaded in production.
 *
 * @param file - Path of an existing mocks file
 * @param options - How the loader resolves imports and where it reuses
 *   transforms; see {@link ConfigJitiOptions}
 * @returns The declared mocks and the file's canonical path
 * @throws ConfigLoadError when the file, or a module it imports, does not
 *   load; what {@link readMocksExport} throws for an export it cannot read
 * @example
 * ```ts
 * const { mocks } = await loadCourierMocksFile("/app/courier.mocks.ts");
 * ```
 */
export async function loadCourierMocksFile(
  file: string,
  options: ConfigJitiOptions = {},
): Promise<LoadedCourierMocks> {
  const mocksFile = realpathSync(file);
  const namespace = await importProjectFile(mocksFile, options);
  return { mocks: readMocksExport(namespace, mocksFile), mocksFile };
}
