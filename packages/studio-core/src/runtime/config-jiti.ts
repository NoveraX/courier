import { dirname } from "node:path";
import type { Jiti } from "jiti";
import { readPathAliases } from "./path-aliases";

/**
 * The module loader for Courier's project files — `courier.config.*` and
 * `courier.mocks.*` — with the options both need: the project's tsconfig path
 * aliases, default-export interop, and no caching.
 *
 * Both caches are off because this is also the reload path: the dev server
 * loads the files again on every edit, and a cached module would hand back
 * the file as it was before the user changed it.
 *
 * jiti is loaded here rather than at the top of a module so a bundler that
 * merely reaches this code does not pull a TypeScript transpiler into its
 * graph; only a process that actually reads such a file pays for it.
 *
 * @param file - Absolute, symlink-resolved path of the file to load; modules
 *   and aliases resolve from its directory
 * @returns A jiti instance for that file
 */
export async function createConfigJiti(file: string): Promise<Jiti> {
  const { createJiti } = await import("jiti");
  return createJiti(file, {
    alias: readPathAliases(dirname(file)).loader,
    interopDefault: true,
    moduleCache: false,
    fsCache: false,
  });
}
