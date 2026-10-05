import type { LoadedCourierConfig } from "../config-loader";
import { declarationText } from "../declaration-text";
import { describeError } from "../describe-error";
import { type ImportDeclarationParts, importDeclarationParts } from "../import-declaration-parts";
import { readRegularFile } from "../read-regular-file";
import { sha256Hex } from "../sha256-hex";
import type { ImportDeclaration, WriteBody } from "../write-types";
import type { ConfigDeclarationPlan } from "./config-declaration-types";
import { ConfigEditRefusal } from "./config-edit-refusal";
import { planConfigDeclaration } from "./plan-config-declaration";

const UTF8 = new TextDecoder("utf-8", { fatal: true });

/** The config as read to declare an import in it, and the change planned. */
export interface PreparedDeclaration {
  /** The import's name. */
  name: string;
  /** What the config must still declare. */
  parts: ImportDeclarationParts;
  /** The same, as the lines to add by hand. */
  declaration: ImportDeclaration;
  /** The config's text as read; empty when it could not be read. */
  text: string;
  /** sha256 of the bytes read; empty when they could not be read. */
  baseHash: string;
  /** The config's permission bits, which the changed file keeps. */
  mode: number;
  /** The change, or why Studio leaves it to the developer. */
  plan: ConfigDeclarationPlan | ConfigEditRefusal;
}

/**
 * Read the config Studio runs and plan the change that declares an import
 * written from `body`: what is left to declare, the config's bytes and their
 * hash, and the planned text — or why Studio cannot make the change.
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
  const read = readConfig(parts.configPath, parts.configFile, root);
  if (read instanceof ConfigEditRefusal) {
    return { name, parts, declaration, text: "", baseHash: "", mode: 0, plan: read };
  }
  return { name, parts, declaration, ...read, plan: planOf(name, parts, read.text) };
}

function readConfig(
  path: string,
  configFile: string,
  root: string,
): { text: string; baseHash: string; mode: number } | ConfigEditRefusal {
  try {
    const file = readRegularFile(path);
    if (file === null) {
      return new ConfigEditRefusal(
        "CONFIG_CHANGED",
        `${configFile} is gone since Studio loaded it.`,
      );
    }
    const text = UTF8.decode(file.bytes);
    return { text, baseHash: sha256Hex(file.bytes), mode: file.stats.mode & 0o7777 };
  } catch (error) {
    const why = `Studio could not read ${configFile} as a UTF-8 file (${describeError(error, root)})`;
    return new ConfigEditRefusal("CONFIG_UNREADABLE", `${why}.`, { cause: error });
  }
}

function planOf(
  name: string,
  parts: ImportDeclarationParts,
  text: string,
): ConfigDeclarationPlan | ConfigEditRefusal {
  try {
    return planConfigDeclaration({
      configName: parts.configFile,
      text,
      name,
      source: parts.source,
      importEntry: parts.importEntry,
    });
  } catch (error) {
    if (error instanceof ConfigEditRefusal) return error;
    throw error;
  }
}
