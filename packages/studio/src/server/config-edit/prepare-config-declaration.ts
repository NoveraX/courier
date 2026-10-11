import type { LoadedCourierConfig } from "../config-loader";
import { declarationText } from "../declaration-text";
import { type ImportDeclarationParts, importDeclarationParts } from "../import-declaration-parts";
import { sha256Hex } from "../sha256-hex";
import type { ImportDeclaration, WriteBody } from "../write-types";
import type { ConfigDeclarationPlan } from "./config-declaration-types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import type { FileChange } from "./file-changes";
import { planConfigDeclaration } from "./plan-config-declaration";
import { planSourcesDeclaration } from "./plan-sources-declaration";
import { type ConfigFileRead, readConfigFile } from "./read-config-file";

/** The config as read to declare an import in it, and the change planned. */
export interface PreparedDeclaration {
  /** The import's name. */
  name: string;
  /** What the config must still declare. */
  parts: ImportDeclarationParts;
  /** The same, as the lines to add by hand. */
  declaration: ImportDeclaration;
  /**
   * sha256 the preview quotes: of the config, or — when the change writes
   * the module the config takes its `sources` from too — of both, as read.
   * Empty when they could not be read.
   */
  baseHash: string;
  /**
   * The files the change writes, in the order it writes them — the module
   * the config takes its `sources` from, then the config — or why Studio
   * leaves the change to the developer.
   */
  plan: FileChange[] | ConfigEditRefusal;
}

/** A file the change reads, as read. */
interface Read extends ConfigFileRead {
  path: string;
  file: string;
}

/**
 * Read the files Studio would change to declare an import written from
 * `body`, and plan the change: the config — and, where the config takes its
 * `sources` from a module of the project (`import { sources } from
 * "./lib/sources"`), that module, which the source is listed in while the
 * config gains the `imports` entry. Each file's bytes are hashed as read,
 * and the change is one: written whole or not at all.
 *
 * @param body - The import as written
 * @param loaded - The config Studio runs
 * @param root - The project root, symlinks resolved
 * @returns The prepared change, or `null` when the config declares the import already
 * @throws {NameTakenError} When `sources` declares another API under the import's name
 * @example
 * ```ts
 * const prepared = prepareConfigDeclaration(body, loaded, root);
 * prepared?.plan instanceof ConfigEditRefusal; // → false for a config Studio can add to
 * ```
 */
export function prepareConfigDeclaration(
  body: WriteBody,
  loaded: LoadedCourierConfig,
  root: string,
): PreparedDeclaration | null {
  const name = body.sourceName;
  const parts = importDeclarationParts({ name, body, loaded, root });
  if (!parts) return null;
  const declaration = declarationText(name, parts);
  const reads = readAll(parts, root);
  if (reads instanceof ConfigEditRefusal) {
    return { name, parts, declaration, baseHash: "", plan: reads };
  }
  const baseHash = combinedHash(reads);
  return { name, parts, declaration, baseHash, plan: planOf(name, parts, reads) };
}

/**
 * The hash a preview quotes for the files a change reads: the file's own
 * when it reads one, a hash of theirs in order when it reads more.
 *
 * @param reads - The files as read, in the order the change writes them
 * @returns The hash
 * @example
 * ```ts
 * combinedHash([config]) === config.baseHash; // → true
 * ```
 */
export function combinedHash(reads: readonly { baseHash: string }[]): string {
  if (reads.length === 1) return reads[0]?.baseHash ?? "";
  return sha256Hex(reads.map((read) => read.baseHash).join(":"));
}

/* The module the source is listed in, when it is not the config, then the config. */
function readAll(parts: ImportDeclarationParts, root: string): Read[] | ConfigEditRefusal {
  const files = [
    ...(parts.sourcesModule && parts.source ? [parts.sourcesModule] : []),
    { path: parts.configPath, file: parts.configFile },
  ];
  const reads: Read[] = [];
  for (const { path, file } of files) {
    const read = readConfigFile(path, file, root);
    if (read instanceof ConfigEditRefusal) return read;
    reads.push({ ...read, path, file });
  }
  return reads;
}

function planOf(
  name: string,
  parts: ImportDeclarationParts,
  reads: readonly Read[],
): FileChange[] | ConfigEditRefusal {
  const config = reads.at(-1);
  const module = reads.length > 1 ? reads[0] : undefined;
  if (config === undefined) return new ConfigEditRefusal("PLAN_REJECTED", "Studio read no config.");
  try {
    const changes: FileChange[] = [];
    if (module && parts.sourcesModule && parts.source) {
      const listed = planSourcesDeclaration({
        fileName: module.file,
        text: module.text,
        exportName: parts.sourcesModule.exportName,
        name,
        source: parts.source,
      });
      changes.push(changeOf(module, listed));
    }
    const declared = planConfigDeclaration({
      configName: parts.configFile,
      text: config.text,
      name,
      source: module ? undefined : parts.source,
      importEntry: parts.importEntry,
    });
    if (declared.edits.length > 0) changes.push(changeOf(config, declared));
    return changes;
  } catch (error) {
    if (error instanceof ConfigEditRefusal) return error;
    throw error;
  }
}

function changeOf(read: Read, plan: ConfigDeclarationPlan): FileChange {
  return { ...read, planned: plan.text, edits: plan.edits };
}
