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
 * @example
 * ```ts
 * findMocksFile("/app"); // → "/app/courier.mocks.ts", or null
 * ```
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
 * declares none, and so does one whose default export is `undefined`, which
 * is how a file switches its mocks off:
 * `export default enabled ? defineMocks({ ... }) : undefined`. An ES module
 * with only named exports is a mistake worth naming, since those would
 * otherwise pass for mocks.
 *
 * The default is read as the module set it, even through the loader's
 * default-export interop, which would hand the whole namespace in place of a
 * default that is `undefined`. A CommonJS module that the loader transpiled —
 * one Node could not run — has no namespace of its own: its `module.exports`
 * is its default, as Node's import makes it, so an object neither marked
 * `__esModule` nor an ES module namespace, and with no `default`, is read
 * whole.
 *
 * @param namespace - The module's namespace object, or a CommonJS module's `module.exports`
 * @param file - The file, for the error message
 * @returns The declared mocks by key
 * @throws When an ES module has no default export, or the mocks are neither an
 *   object nor `undefined`
 * @example
 * ```ts
 * readMocksExport({ default: { apiMock: { source: api } } }, file); // → { apiMock: { source: api } }
 * readMocksExport({ default: undefined }, file); // → {}
 * ```
 */
export function readMocksExport(namespace: unknown, file: string): Record<string, unknown> {
  const exports = typeof namespace === "object" && namespace !== null ? namespace : {};
  const declared = Object.getOwnPropertyDescriptor(exports, "default");
  if (declared === undefined) return readWithoutDefault(exports, file);
  const mocks: unknown = declared.get ? declared.get.call(exports) : declared.value;
  return mocks === undefined ? {} : checkedMocks(mocks, file);
}

function readWithoutDefault(exports: object, file: string): Record<string, unknown> {
  if (isCommonJsExports(exports)) return checkedMocks(exports, file);
  if (Object.keys(exports).length === 0) return {};
  throw new Error(`${file} has no default export; export default defineMocks({ ... })`);
}

/* A transpiled ES module is marked `__esModule`, and one Node imported is a
   namespace object; `module.exports` is neither. */
function isCommonJsExports(exports: object): boolean {
  if (Object.hasOwn(exports, "__esModule")) return false;
  return Object.prototype.toString.call(exports) !== "[object Module]";
}

function checkedMocks(mocks: unknown, file: string): Record<string, unknown> {
  if (isMocksObject(mocks)) return mocks;
  throw new Error(
    `${file} must export an object of mocks by key: export default defineMocks({ ... })`,
  );
}

function isMocksObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
