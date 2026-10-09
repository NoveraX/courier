import { relative, sep } from "node:path";
import type { LoadedCourierConfig } from "../config-loader";
import { configReads } from "../config-reads";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { configObjectFile } from "./config-object-file";
import type { ConfigUndeclarationPlan } from "./config-undeclaration-types";
import { planConfigUndeclaration } from "./plan-config-undeclaration";
import { readConfigFile } from "./read-config-file";

/** The config as read to take an import out of it, and the change planned. */
export interface PreparedUndeclaration {
  /** The import's name. */
  name: string;
  /** The config, relative to the project root. */
  configFile: string;
  /** The config's absolute path. */
  configPath: string;
  /** Whether the change takes the import's `sources` entry out. */
  source: boolean;
  /** Whether the change takes the import's `imports` entry out. */
  importEntry: boolean;
  /** The config's text as read; empty when it could not be read. */
  text: string;
  /** sha256 of the bytes read; empty when they could not be read. */
  baseHash: string;
  /** The config's permission bits, which the changed file keeps. */
  mode: number;
  /** The change, or why Studio leaves it to the developer. */
  plan: ConfigUndeclarationPlan | ConfigEditRefusal;
}

/**
 * Read the config Studio runs and plan the change that takes an import out
 * of it: its `imports` entry, and its `sources` entry when that is the
 * import's — when the config read one of the files the removal may take.
 * A source of that name read from elsewhere is another API, and stays.
 *
 * @param name - The import
 * @param loaded - The config Studio runs
 * @param root - The project root, symlinks resolved
 * @param mayTake - Every file the removal may take, project-relative
 * @returns The prepared change, or `null` when the config declares neither
 * @example
 * ```ts
 * const prepared = prepareConfigUndeclaration("pets", running, root, ["src/api/pets/source.ts"]);
 * prepared?.plan instanceof ConfigEditRefusal; // → false for a config Studio can change
 * ```
 */
export function prepareConfigUndeclaration(
  name: string,
  loaded: LoadedCourierConfig,
  root: string,
  mayTake: readonly string[],
): PreparedUndeclaration | null {
  const importEntry = Object.hasOwn(loaded.config.imports ?? {}, name);
  const source =
    Object.hasOwn(loaded.config.sources ?? {}, name) &&
    configReads(loaded, root, mayTake).length > 0;
  if (!importEntry && !source) return null;
  const configPath = configObjectFile(loaded.configFile, root);
  const configFile = relative(root, configPath).split(sep).join("/");
  const prepared = { name, configFile, configPath, source, importEntry };
  const read = readConfigFile(configPath, configFile, root);
  if (read instanceof ConfigEditRefusal) {
    return { ...prepared, text: "", baseHash: "", mode: 0, plan: read };
  }
  return { ...prepared, ...read, plan: planOf(prepared, read.text) };
}

function planOf(
  {
    name,
    configFile,
    source,
    importEntry,
  }: Pick<PreparedUndeclaration, "name" | "configFile" | "source" | "importEntry">,
  text: string,
): ConfigUndeclarationPlan | ConfigEditRefusal {
  try {
    const plan = planConfigUndeclaration({
      configName: configFile,
      text,
      name,
      source,
      importEntry,
    });
    if (plan !== null) return plan;
    return new ConfigEditRefusal(
      "LIST_SHAPE",
      `${configFile} declares ${name} where Studio cannot see it, through a spread or another module, so Studio cannot take it out.`,
    );
  } catch (error) {
    if (error instanceof ConfigEditRefusal) return error;
    throw error;
  }
}
