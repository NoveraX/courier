import type { DiffHunk } from "../mocks-edit/types";
import type { ImportDeclaration } from "../write-types";
import type { ConfigEditRefusalCode } from "./config-edit-refusal";

/** The change Studio would make to declare the import, ready to apply. */
export interface ReadyDeclaration {
  status: "ready";
  /** The config, relative to the project root. */
  configFile: string;
  /** Every line the change adds, between the lines around it. */
  hunks: DiffHunk[];
  /** sha256 of the config the change was planned against; applying quotes it. */
  baseHash: string;
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
  /** The config declares the import and Studio runs it. */
  | { status: "applied"; configFile: string }
  /** The config changed since the preview; this is the change against it now. */
  | { status: "stale"; preview: DeclarePreview }
  | ManualDeclaration
  | DeclaredAlready;
