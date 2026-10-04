import { lstatSync } from "node:fs";
import { resolve } from "node:path";

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
