import * as nodeModule from "node:module";
import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const require = nodeModule.createRequire(import.meta.url);

/** The files of the modules code loaded since tracking began. */
export interface ModuleFiles {
  /** Tell it of a file a module was loaded from: the config's loader tells it of each it transforms. */
  noteFile(file: string): void;
  /** Every file noted, absolute: those it was told of, and those Node loaded itself. */
  files(): string[];
}

/**
 * Note the file of every module the code that runs next loads: the ones
 * the config's loader transforms are told by `noteFile`; the ones Node
 * loads itself are read from its CommonJS cache and, where Node has
 * synchronous hooks, from each ES module it resolves.
 *
 * @returns The files noted, and how to note one
 * @example
 * ```ts
 * const modules = trackModuleFiles();
 * await loadCourierConfigFile(file, { onModule: modules.noteFile });
 * modules.files(); // ["/app/courier.config.ts", "/app/src/api.ts", …]
 * ```
 */
export function trackModuleFiles(): ModuleFiles {
  const noted = new Set<string>();
  /* Read off the namespace, not imported by name: Node before 22.15 has no such
     export, and a named import of it would stop the module from loading at all.
     There, the ES modules Node loads itself go unnoted. */
  if (typeof nodeModule.registerHooks === "function") {
    nodeModule.registerHooks({
      resolve(specifier, context, nextResolve) {
        const resolved = nextResolve(specifier, context);
        if (resolved.url.startsWith("file:")) noted.add(fileURLToPath(resolved.url));
        return resolved;
      },
    });
  }
  return {
    noteFile: (file) => noted.add(file),
    files: () => [...noted, ...Object.keys(require.cache).filter((key) => isAbsolute(key))],
  };
}
