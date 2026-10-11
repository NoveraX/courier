import type { DiffHunk } from "../mocks-edit/types";
import type { ImportDeclaration } from "../write-types";
import type { ConfigEditRefusalCode } from "./config-edit-refusal";

/** The change Studio would make to declare the import, ready to apply. */
export interface ReadyDeclaration {
  status: "ready";
  /** The config, relative to the project root. */
  configFile: string;
  /**
   * Every file the change writes, in the order it writes them — the module
   * the config takes its `sources` from, when it does, then the config —
   * each with the lines the change adds between the lines around them.
   */
  files: FileHunks[];
  /** sha256 of what the change was planned against — the config, and that module when it writes it; applying quotes it. */
  baseHash: string;
}

/** One file a change writes, and the lines it adds or removes there. */
export interface FileHunks {
  /** The file, relative to the project root. */
  file: string;
  /** Every line the change adds or removes, between the lines around it. */
  hunks: DiffHunk[];
}

/** Why the declaration is left to the developer, and the lines to add by hand. */
export interface ManualDeclaration {
  status: "manual";
  code: ConfigEditRefusalCode;
  reason: string;
  /** The lines to add by hand; absent when Studio could not work them out, as while it is busy. */
  declaration?: ImportDeclaration | undefined;
}

/** The config declares the import already: nothing is left to add. */
export interface DeclaredAlready {
  status: "declared";
}

/** What declaring an import in the config would do. */
export type DeclarePreview = ReadyDeclaration | ManualDeclaration | DeclaredAlready;

/** What asking Studio to declare an import did. */
export type DeclareApplyResult =
  /** The config declares the import and Studio runs it: the files it wrote, in order. */
  | { status: "applied"; files: string[] }
  /** The config changed since the preview; this is the change against it now. */
  | { status: "stale"; preview: DeclarePreview }
  | ManualDeclaration
  | DeclaredAlready;
