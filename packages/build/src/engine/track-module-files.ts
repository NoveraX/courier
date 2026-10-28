import { createRequire } from "node:module";
import { isAbsolute } from "node:path";

import { noteResolvedFiles, type ResolveHooks } from "./note-resolved-files";

const require = createRequire(import.meta.url);

/** The files of the modules code loaded since tracking began. */
export interface ModuleFiles {
  /** Tell it of a file a module was loaded from: the config's loader tells it of each it transforms. */
  noteFile(file: string): void;
  /**
   * Every file noted, absolute: those it was told of, and those Node loaded
   * itself, once the notes of every module resolved so far are in.
   */
  files(): Promise<string[]>;
}

/**
 * Note the file of every module the code that runs next loads: the ones
 * the config's loader transforms are told by `noteFile`; the ones Node
 * loads itself are read from its CommonJS cache and from each ES module it
 * resolves.
 *
 * @param hooks - How the ES modules Node resolves are noted: synchronously wherever Node can
 * @returns The files noted, and how to note one
 * @example
 * ```ts
 * const modules = trackModuleFiles();
 * await loadCourierConfigFile(file, { onModule: modules.noteFile });
 * await modules.files(); // ["/app/courier.config.ts", "/app/src/api.ts", …]
 * ```
 */
export function trackModuleFiles(hooks?: ResolveHooks): ModuleFiles {
  const noted = new Set<string>();
  const resolved = noteResolvedFiles(noted, hooks);
  return {
    noteFile: (file) => noted.add(file),
    files: async () => {
      await resolved.settled();
      return [...noted, ...Object.keys(require.cache).filter((key) => isAbsolute(key))];
    },
  };
}
