import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import type { ConfigJitiOptions } from "./config-jiti";
import { createConfigJiti } from "./config-jiti";

/**
 * The file names `courier.mocks.*` may have, in the order they are looked for,
 * in the project root beside `courier.config.*`.
 */
export const MOCKS_BASENAMES: ReadonlyArray<string> = [
  "courier.mocks.ts",
  "courier.mocks.mts",
  "courier.mocks.cts",
  "courier.mocks.js",
  "courier.mocks.mjs",
  "courier.mocks.cjs",
];

/** A `courier.mocks.*` file that was loaded, and the mocks it declares. */
export interface LoadedCourierMocks {
  /** The declared mocks by key, unchecked: whatever the user wrote under each. */
  mocks: Record<string, unknown>;
  /** Absolute, symlink-resolved path of the file. */
  mocksFile: string;
}

/**
 * Find the project's `courier.mocks.*`: the first of {@link MOCKS_BASENAMES}
 * present in the project root. A symbolic link counts as present, even one
 * whose target is gone, so it is reported rather than taken for no file.
 *
 * @param projectRoot - The directory Studio found `courier.config.*` in
 * @returns The path as found in the root, or `null` when the project declares no mocks
 */
export function findMocksFile(projectRoot: string): string | null {
  for (const basename of MOCKS_BASENAMES) {
    const candidate = resolve(projectRoot, basename);
    if (lstatSync(candidate, { throwIfNoEntry: false })) return candidate;
  }
  return null;
}

/**
 * The mocks a `courier.mocks.*` module declares, read from its namespace: the
 * default export, which must be an object. A module with no statements
 * declares none; one with only named exports is a mistake worth naming,
 * since those would otherwise pass for mocks.
 *
 * @param namespace - The module's namespace object
 * @param file - The file, for the error message
 * @returns The declared mocks by key
 * @throws When the file has no default export, or it is not an object
 */
export function readMocksExport(namespace: unknown, file: string): Record<string, unknown> {
  const exports = (typeof namespace === "object" && namespace !== null ? namespace : {}) as Record<
    string,
    unknown
  >;
  if (!Object.hasOwn(exports, "default")) {
    if (Object.keys(exports).length === 0) return {};
    throw new Error(`${file} has no default export; export default defineMocks({ ... })`);
  }
  const declared = exports.default;
  if (typeof declared !== "object" || declared === null || Array.isArray(declared)) {
    throw new Error(
      `${file} must export an object of mocks by key: export default defineMocks({ ... })`,
    );
  }
  return declared as Record<string, unknown>;
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
