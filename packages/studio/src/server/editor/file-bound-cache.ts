import { type BigIntStats, statSync } from "node:fs";

import { type SourceModules, sourceModules } from "../contract-drift/schema-edit/source-modules";

/** A value worked out from the project's files, kept while they stay as they were. */
export interface FileBoundCache<TValue> {
  /**
   * The value for the config Studio runs: the one kept, while the config is
   * the same and no file it was worked out from changed; worked out again
   * otherwise.
   *
   * @param config - The config Studio runs; another one is a reload
   * @param compute - Works the value out, reading the project's files through the modules it is given
   */
  read(config: object, compute: (modules: SourceModules) => TValue): TValue;
}

interface Kept<TValue> {
  config: object;
  files: ReadonlyMap<string, string>;
  value: TValue;
}

/**
 * Keep what is worked out from the project's source files — where each
 * endpoint is declared, where each group writes its endpoints — until a
 * file it read changes or the config reloads. Each read looks at the size
 * and times of those files, a call to the file system apiece, rather than
 * reading every file and parsing it again: an editor asks every few
 * seconds, and a project of a thousand endpoints is hundreds of files.
 *
 * @param root - The project's root
 * @returns The cache
 * @example
 * ```ts
 * const definitions = fileBoundCache<EndpointDefinition[]>(root);
 * definitions.read(running, (modules) => endpointDefinitions(root, configFile, catalog, modules));
 * ```
 */
export function fileBoundCache<TValue>(root: string): FileBoundCache<TValue> {
  let kept: Kept<TValue> | undefined;
  return {
    read(config, compute) {
      if (kept && kept.config === config && unchanged(kept.files)) return kept.value;
      const modules = sourceModules(root);
      const value = compute(modules);
      kept = { config, files: signaturesOf(modules.files()), value };
      return value;
    },
  };
}

function signaturesOf(paths: readonly string[]): Map<string, string> {
  return new Map(paths.map((path) => [path, signatureOf(path)]));
}

function unchanged(files: ReadonlyMap<string, string>): boolean {
  for (const [path, signature] of files) if (signatureOf(path) !== signature) return false;
  return true;
}

/* A file is the same while its size and times are: a save gives it new times, if not a new size. */
function signatureOf(path: string): string {
  const stats: BigIntStats | undefined = statSync(path, { bigint: true, throwIfNoEntry: false });
  return stats ? `${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}` : "absent";
}
