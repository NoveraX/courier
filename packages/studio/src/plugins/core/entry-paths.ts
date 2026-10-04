import { existsSync, realpathSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The absolute paths of a bundler's entry points, from the shapes esbuild's
 * `entryPoints` and Rollup's `input` take: a path, a list of paths or of
 * `{ in }` objects, or a record of names to paths.
 *
 * Plugins match entries by these paths rather than asking the bundler, because
 * a plugin that loads modules while resolving — @rollup/plugin-commonjs does,
 * for every entry — gets a module transformed before the bundler has marked it
 * as an entry.
 *
 * @param entries - The bundler's entry option, as given.
 * @param cwd - The directory relative entries are resolved against.
 * @returns The entry paths, resolved, and their real paths where they differ.
 */
export function entryPathsOf(entries: unknown, cwd: string = process.cwd()): Set<string> {
  const paths = new Set<string>();
  for (const entry of entryList(entries)) {
    const path = resolve(cwd, entry);
    paths.add(path);
    /* Resolvers that follow symlinks — node-resolve does — name the module by
       its real path. */
    if (existsSync(path)) paths.add(realpathSync(path));
  }
  return paths;
}

function entryList(entries: unknown): string[] {
  if (typeof entries === "string") return [entries];
  if (Array.isArray(entries)) return entries.flatMap(entryOf);
  if (typeof entries === "object" && entries !== null)
    return Object.values(entries).flatMap(entryOf);
  return [];
}

function entryOf(entry: unknown): string[] {
  if (typeof entry === "string") return [entry];
  if (typeof entry === "object" && entry !== null && "in" in entry) {
    const source = entry.in;
    if (typeof source === "string") return [source];
  }
  return [];
}
