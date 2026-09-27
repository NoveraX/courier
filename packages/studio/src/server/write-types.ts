/**
 * Shared types for apis write routes.
 */

import type { CourierImportType } from "@noverax/courier/config";
import type { GenerateOptions, ParsedSpec } from "../apis";

/**
 * A request to write an import's files. Studio generates them itself from
 * the spec and the options; a request names no path and carries no content.
 */
export interface WriteBody {
  /** The import's name, which the import wizard also gives its source. */
  sourceName: string;
  spec: ParsedSpec;
  specUrl?: string;
  importType?: CourierImportType;
  options: GenerateOptions;
  /** The digest of the plan the user was shown, once a plan was shown. */
  planDigest?: string;
  /** The files whose pending step the user allowed. */
  confirm?: string[];
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
}

/** What writing an import's files did. */
export interface WriteResult {
  /** Project-relative files written. */
  written: string[];
  /** Project-relative files removed, into the backup. */
  removed: string[];
  /** Files left as they were, and why. */
  kept: Array<{ path: string; reason: string }>;
  /** Project-relative directory holding the files replaced and removed. */
  backupDir: string;
  /** Folders the write emptied that Studio could not remove, and why. */
  pruneFailures: Array<{ path: string; code: string }>;
  /** Files Studio wrote before the import's directory moved, left where they are. */
  leftBehind: string[];
  /** What the config must still declare for the import written; absent once it declares all of it. */
  declaration?: ImportDeclaration;
}
