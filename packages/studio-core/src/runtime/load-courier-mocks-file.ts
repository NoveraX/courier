import { realpathSync } from "node:fs";
import type { ConfigJitiOptions } from "./config-jiti";
import { createConfigJiti } from "./config-jiti";
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
 * @throws What the loader reported, or what {@link readMocksExport} did
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
  const jiti = await createConfigJiti(mocksFile, options);
  const namespace = await jiti.import<unknown>(mocksFile);
  return { mocks: readMocksExport(namespace, mocksFile), mocksFile };
}
