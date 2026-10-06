import { relative, sep } from "node:path";
import type { LoadedCourierConfig } from "./config-loader";
import { configReads } from "./config-reads";

/** What courier.config still says about an import once its files are gone. */
export interface RemovalConfigNotes {
  /** The config Studio runs, relative to the project root; absent while none runs. */
  configFile?: string;
  /** Whether that config still declares the import under `imports`. */
  importDeclared: boolean;
  /**
   * Files the removal may take away that the config imports, relative to the
   * project root: once they are gone, the config stops loading until those
   * imports go too.
   */
  configImports: string[];
}

/**
 * Say what the running config still holds of an import whose files go: its
 * `imports` entry, and which of those files the config read when it loaded.
 *
 * @param root - The project root, symlinks resolved
 * @param name - The import
 * @param running - The config Studio runs, or `null`
 * @param taken - The files the removal takes, or may take, project-relative
 * @returns The notes
 * @example
 * ```ts
 * removalConfigNotes(root, "pets", running, ["src/api/pets/source.ts", "src/api/pets/index.ts"]);
 * // → { configFile: "courier.config.ts", importDeclared: true, configImports: ["src/api/pets/source.ts"] }
 * ```
 */
export function removalConfigNotes(
  root: string,
  name: string,
  running: LoadedCourierConfig | null,
  taken: readonly string[],
): RemovalConfigNotes {
  if (running === null) return { importDeclared: false, configImports: [] };
  return {
    configFile: relative(root, running.configFile).split(sep).join("/"),
    importDeclared: Object.hasOwn(running.config.imports ?? {}, name),
    configImports: configReads(running, root, taken),
  };
}
