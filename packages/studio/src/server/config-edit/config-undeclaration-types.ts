import type { TextEdit } from "../mocks-edit/types";
import type { FileHunks } from "./config-declare-types";
import type { ConfigEditRefusalCode } from "./config-edit-refusal";

/** What taking an import out of the config removes from it. */
export interface ConfigUndeclarationInput {
  /** The config's file name, as the messages name it. */
  configName: string;
  /** The config's text as read. */
  text: string;
  /** The import's name: its key under `sources` and `imports`. */
  name: string;
  /** Take the import's `sources` entry out, and the imports only that entry used. */
  source: boolean;
  /** Take the import's `imports` entry out. */
  importEntry: boolean;
}

/** The config without the import, and the removals that make it so. */
export interface ConfigUndeclarationPlan {
  text: string;
  /** Removals from the config as read, in text order. */
  edits: TextEdit[];
}

/** The change Studio would make to take the import out of the config, ready to make. */
export interface ReadyUndeclaration {
  status: "ready";
  /** The config, relative to the project root. */
  configFile: string;
  /**
   * Every file the change writes, in the order it writes them — the module
   * the config takes its `sources` from, when it does, then the config —
   * each with the lines it removes or changes between the lines around them.
   */
  files: FileHunks[];
  /** sha256 of what the change was planned against — the config, and that module when it writes it; removing the import quotes it. */
  baseHash: string;
}

/** Why taking the import out of the config is left to the developer. */
export interface ManualUndeclaration {
  status: "manual";
  code: ConfigEditRefusalCode;
  reason: string;
}

/** What taking an import out of the config would do; `null` where the config does not declare it. */
export type UndeclarePreview = ReadyUndeclaration | ManualUndeclaration;

/** What asking Studio to take an import out of the config did. */
export type UndeclareResult =
  /**
   * The config no longer declares the import, and Studio runs it: the config,
   * relative to the project root, and the files the change wrote, in order.
   */
  | { status: "applied"; configFile: string; files: string[] }
  /** The config changed since the preview; this is the change against it now. */
  | { status: "stale"; preview: UndeclarePreview | null }
  | ManualUndeclaration;

/** What a removal asks of the config. */
export interface UndeclareRequest {
  /** The import. */
  name: string;
  /** Every file the removal may take, those waiting for the user's leave too, project-relative. */
  mayTake: readonly string[];
  /** The files the removal takes as the user allowed it, project-relative. */
  taking: readonly string[];
  /** sha256 of the config the preview was planned against. */
  baseHash: string;
}
