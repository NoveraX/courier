import type { CourierImportEntry } from "@noverax/courier/config";

import type { TextEdit } from "../mocks-edit/types";

/** What declaring an import in the config adds to it. */
export interface ConfigDeclarationInput {
  /** The config's file name, as the messages name it. */
  configName: string;
  /** The config's text as read. */
  text: string;
  /** The import's name: its key under `sources` and `imports`. */
  name: string;
  /** Importing the generated source and naming it under `sources`; absent when `sources` declares it. */
  source?: { binding: string; specifier: string } | undefined;
  /** The `imports` entry; absent when `imports` names the import. */
  importEntry?: CourierImportEntry | undefined;
}

/** The config as declaring the import leaves it, and the insertions that make it so. */
export interface ConfigDeclarationPlan {
  text: string;
  edits: TextEdit[];
}
