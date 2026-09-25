import { extractConfigDeps } from "./extract-config-deps";

/**
 * Every file a load depends on, with the hash of what it held when the load
 * read it: the sha256 of its bytes, `null` when it was absent, or
 * `"unreadable"`.
 */
export type ProjectInputs = ReadonlyMap<string, string | null>;

/**
 * Read what a load of the project is about to evaluate, before it does.
 *
 * That is every module the config and the mocks file transitively import,
 * both entries included; every absent path an import that names no module
 * yet could name one at; and every name either entry may take in the project
 * root, present or not: creating one, or one that takes precedence over the
 * file loaded, must reload, and nothing Studio imports would otherwise point
 * at it.
 *
 * Read before evaluating, so a save that lands while the load runs differs
 * from what is recorded here, and whoever watches the files can tell. The
 * entry names are hashed before the entries are looked for (see
 * `readEntryNames`); the walk's later read of each entry found stands.
 *
 * @param entryNames - Every entry name in the root, hashed before the
 *   entries were looked for
 * @param configFile - The config's absolute, symlink-resolved path
 * @param mocksFile - The mocks file's absolute, symlink-resolved path, or
 *   `null` when there is none
 * @returns Each path and the hash of what it held, the walk's modules first
 * @example
 * ```ts
 * const names = readEntryNames(root);
 * const inputs = readProjectInputs(names, configFile, mocksFile);
 * inputs.get(configFile); // "2c26b4…"
 * ```
 */
export function readProjectInputs(
  entryNames: ProjectInputs,
  configFile: string,
  mocksFile: string | null,
): ProjectInputs {
  const inputs = extractConfigDeps(mocksFile === null ? [configFile] : [configFile, mocksFile]);
  for (const [path, hash] of entryNames) {
    if (!inputs.has(path)) inputs.set(path, hash);
  }
  return inputs;
}
