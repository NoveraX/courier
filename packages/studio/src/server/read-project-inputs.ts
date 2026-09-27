import { dirname } from "node:path";

import { extractConfigDeps } from "./extract-config-deps";
import { readTsconfigInputs } from "./read-tsconfig-inputs";

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
 * both entries included; every absent path where a module created would be
 * the one an import runs, whether it names a module yet or not; every
 * tsconfig the path aliases of either entry are read from (see
 * `readTsconfigInputs`), since an edit to one sends an aliased import to
 * another module; and every name either entry may take in the project root,
 * present or not: creating one, or one that takes precedence over the file
 * loaded, must reload, and nothing Studio imports would otherwise point at
 * it.
 *
 * Read before evaluating, so a save that lands while the load runs differs
 * from what is recorded here, and whoever watches the files can tell. The
 * entry names are hashed before the entries are looked for (see
 * `readEntryNames`), and the tsconfigs before the walk reads its aliases from
 * them; the walk's later read of each entry found stands.
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
  const entries = mocksFile === null ? [configFile] : [configFile, mocksFile];
  const directories = [...new Set(entries.map((entry) => dirname(entry)))];
  const tsconfigs = new Map(directories.flatMap((directory) => [...readTsconfigInputs(directory)]));
  const inputs = extractConfigDeps(entries);
  for (const [path, hash] of [...tsconfigs, ...entryNames]) {
    if (!inputs.has(path)) inputs.set(path, hash);
  }
  return inputs;
}
