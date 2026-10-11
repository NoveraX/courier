import { relative, sep } from "node:path";
import type { LoadedCourierConfig } from "../config-loader";
import { configReads } from "../config-reads";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { configObjectFile } from "./config-object-file";
import type { ConfigUndeclarationPlan } from "./config-undeclaration-types";
import type { FileChange } from "./file-changes";
import { planConfigUndeclaration } from "./plan-config-undeclaration";
import { planSourcesUndeclaration } from "./plan-sources-undeclaration";
import { combinedHash } from "./prepare-config-declaration";
import { type ConfigFileRead, readConfigFile } from "./read-config-file";
import { type SourcesModule, sourcesModuleFor } from "./sources-module";

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
  /** The module the config takes its `sources` from, when the `sources` entry is taken out there. */
  sourcesModule?: SourcesModule | undefined;
  /** sha256 the preview quotes: of the config, and of that module when the change writes it; empty when they could not be read. */
  baseHash: string;
  /** The files the change writes, in the order it writes them, or why Studio leaves it to the developer. */
  plan: FileChange[] | ConfigEditRefusal;
}

/** A file the change reads, as read. */
interface Read extends ConfigFileRead {
  path: string;
  file: string;
}

/**
 * Read the files Studio would change to take an import out of the config,
 * and plan the change: its `imports` entry, and its `sources` entry when
 * that is the import's — when the config read one of the files the removal
 * may take. Where the config takes its `sources` from a module of the
 * project, the `sources` entry and the import only it used go from that
 * module. A source of that name read from elsewhere is another API, and stays.
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
  const sourcesModule = source ? sourcesModuleFor(configPath, root) : undefined;
  const prepared = { name, configFile, configPath, source, importEntry, sourcesModule };
  const reads = readAll(prepared, root);
  if (reads instanceof ConfigEditRefusal) return { ...prepared, baseHash: "", plan: reads };
  return { ...prepared, baseHash: combinedHash(reads), plan: planOf(prepared, reads) };
}

type Prepared = Omit<PreparedUndeclaration, "baseHash" | "plan">;

/* The module the source is listed in, when it is not the config, then the config. */
function readAll(prepared: Prepared, root: string): Read[] | ConfigEditRefusal {
  const { sourcesModule, configPath, configFile } = prepared;
  const files = [...(sourcesModule ? [sourcesModule] : []), { path: configPath, file: configFile }];
  const reads: Read[] = [];
  for (const { path, file } of files) {
    const read = readConfigFile(path, file, root);
    if (read instanceof ConfigEditRefusal) return read;
    reads.push({ ...read, path, file });
  }
  return reads;
}

function planOf(prepared: Prepared, reads: readonly Read[]): FileChange[] | ConfigEditRefusal {
  const { name, configFile, sourcesModule, source, importEntry } = prepared;
  const config = reads.at(-1);
  const module = reads.length > 1 ? reads[0] : undefined;
  if (config === undefined) return new ConfigEditRefusal("PLAN_REJECTED", "Studio read no config.");
  try {
    const changes: FileChange[] = [];
    const unlisted =
      module && sourcesModule
        ? planSourcesUndeclaration({
            fileName: module.file,
            text: module.text,
            exportName: sourcesModule.exportName,
            name,
          })
        : null;
    if (module && unlisted) changes.push(changeOf(module, unlisted));
    const undeclared = planConfigUndeclaration({
      configName: configFile,
      text: config.text,
      name,
      source: source && module === undefined,
      importEntry,
    });
    if (undeclared) changes.push(changeOf(config, undeclared));
    if (changes.length > 0 && (module === undefined || unlisted !== null)) return changes;
    return new ConfigEditRefusal(
      "LIST_SHAPE",
      `${module?.file ?? configFile} declares ${name} where Studio cannot see it, through a spread or another module, so Studio cannot take it out.`,
    );
  } catch (error) {
    if (error instanceof ConfigEditRefusal) return error;
    throw error;
  }
}

function changeOf(read: Read, plan: ConfigUndeclarationPlan): FileChange {
  return { ...read, planned: plan.text, edits: plan.edits };
}
