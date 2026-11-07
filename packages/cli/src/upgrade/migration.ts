import type { AstNode } from "./codemod/ast";
import type { PieceKind } from "./codemod/source-files";
import type { PieceSide } from "./entries/piece-sides";

/** A change to a file's text: its span replaced by new text. */
export interface TextEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** What a migration finds that it does not change itself: where, what it is, and what to write instead. */
export interface Finding {
  /** Where it starts in the file's text. */
  readonly at: number;
  /** What it is and why it is left to the person, in a sentence. */
  readonly what: string;
  /** What to write in its place. */
  readonly instead: readonly string[];
}

/** A package the code a migration wrote needs: one the release moved an import to. */
export interface PackageNeed {
  readonly name: string;
  /** The package whose field it is listed in beside: a manifest that lists that one as a dependency lists this one so. */
  readonly beside: string;
}

/** A file of the project's code, as a migration reads it: a module, or a script block of a component's file. */
export interface SourceFile {
  /** Relative to the workspace's root, `/`-separated. */
  readonly path: string;
  readonly text: string;
  /** Its tree, as oxc parsed the text. */
  readonly program: AstNode;
  /** Which piece of the file it is, and its index among them, as `codePieces` gives them. */
  readonly kind: PieceKind;
  readonly piece: number;
}

/** What a migration reads of the whole workspace beside a file, worked out once for a run. */
export interface ProjectView {
  /** Where a piece of a file runs: a page's bundle, the server's code, or neither that the workspace tells. */
  sideOf(path: string, piece: number): PieceSide;
  /** What telling the sides could not read, as steps of the plan: none where no side was asked. */
  notes?(): ReadonlyArray<{ readonly file: string; readonly what: string }>;
}

/** What a migration does to one file: its changes, what it leaves to the person, and the packages its changes need. */
export interface FileMigration {
  readonly edits: readonly TextEdit[];
  readonly findings: readonly Finding[];
  readonly packages: readonly PackageNeed[];
}

/**
 * A change a release made that code written for the release before needs
 * carried over: what it changes for certain, and what it finds and
 * leaves to the person, with what to write instead.
 */
export interface Migration {
  /** Its name, for the plan and the JSON document: `0.5.0/realtime-errors`. */
  readonly id: string;
  /** What it carries over, in a few words, for the plan. */
  readonly title: string;
  /**
   * The words a file writes wherever this migration has something to do
   * in it: the names, properties and modules it looks for. A file that
   * writes none of them, as they are or spelled with escapes, is not
   * parsed for it.
   */
  readonly mentions: readonly string[];
  /**
   * Its changes to one file, and its findings: a pure function of the
   * file's text and of what the workspace tells of it, which the upgrade
   * runs on each file that names Courier's packages.
   */
  readonly migrate: (file: SourceFile, project: ProjectView) => FileMigration;
}

/** A breaking change of a release, and where its notes say what to write instead. */
export interface ReleaseNote {
  readonly title: string;
  readonly docs: string;
}

/** A release that changed what code written for the one before it does. */
export interface Release {
  /** Its version, the first of its line: `0.5.0`. */
  readonly version: string;
  readonly notes: readonly ReleaseNote[];
  readonly migrations: readonly Migration[];
}
