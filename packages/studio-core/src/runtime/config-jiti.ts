import { dirname } from "node:path";
import type { Jiti } from "jiti";
import { readPathAliases } from "./path-aliases";

/** How a project-file loader resolves imports. */
export interface ConfigJitiOptions {
  /**
   * Whether imports resolve through the project's tsconfig path aliases, as
   * the project's own files expect. Off to load an installed package as it is:
   * an alias of its scope would send its imports to project sources.
   */
  aliases?: boolean;
}

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
 * @param options - Whether to resolve through the project's path aliases (default: yes)
 * @returns A jiti instance for that file
 */
export async function createConfigJiti(
  file: string,
  { aliases = true }: ConfigJitiOptions = {},
): Promise<Jiti> {
  const { createJiti } = await import("jiti");
  return createJiti(file, {
    alias: aliases ? readPathAliases(dirname(file)).loader : {},
    interopDefault: true,
    moduleCache: false,
    fsCache: false,
  });
}
