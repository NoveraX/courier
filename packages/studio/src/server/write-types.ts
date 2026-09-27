/**
 * Shared types for apis write routes.
 */

import type { CourierImportType } from "@noverax/courier/config";
import type { GenerateOptions, ParsedSpec } from "../apis";

export interface WriteBody {
  files: { path: string; content: string }[];
  sourceName?: string;
  spec?: ParsedSpec;
  specUrl?: string;
  importType?: CourierImportType;
  options?: GenerateOptions;
}

/**
 * What `courier.config` must still declare for an import Studio wrote. Studio
 * writes the generated files only: it changes no config, so each part stays
 * for the user to add, and a part the config declares already is left out.
 */
export interface ImportDeclaration {
  /** The config to edit, relative to the project root. */
  configFile: string;
  /**
   * Importing the generated source, and naming it under `sources`: Studio
   * lists an API — on the APIs page, in the Explorer and the Playground —
   * only once `sources` declares it.
   */
  source?: { importLine: string; entry: string };
  /**
   * The entry under `imports`, which Studio reads to keep the edits made to
   * the generated endpoints when the import is written again, to regenerate
   * the code, and, for a URL import, to check its specification for updates.
   */
  importEntry?: string;
  /**
   * How many of the specification's endpoints the write left out. The
   * `imports` entry cannot keep that selection, so regenerating from it, as
   * an update does, generates them too. Set only with `importEntry`.
   */
  leftOut?: number;
  /**
   * Set when `sources` declares another API under the import's name: the
   * config does not import the generated source, `sourceFile`, relative to
   * the project root. Studio matches an import to the source of its name, so
   * neither part is offered.
   */
  nameTaken?: { sourceFile: string };
}

export interface WriteResult {
  written: number;
  merged: number;
  deleted?: number;
  files: { path: string; status: string }[];
  /** What the config must still declare for the import written; absent once it declares all of it. */
  declaration?: ImportDeclaration;
}
