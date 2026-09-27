/**
 * What the planner of an edit to `courier.mocks.ts` takes, what it returns,
 * and what a plan claims about itself for the audit to hold it to.
 */

import type { MockDeclaration, TextEdit } from "../types";

/** How a file is written, so text added to it reads like the rest. */
export interface FileStyle {
  /** The line terminator its lines end with: LF, CRLF, or a lone CR. */
  eol: "\n" | "\r\n" | "\r";
  quote: '"' | "'";
  semicolons: boolean;
  /** One level of indentation: a tab, or two to eight spaces. */
  indent: string;
  trailingCommas: boolean;
}

/** The mocks file in the project root, as Studio found it. */
export interface ExistingMocksFile {
  name: string;
  /**
   * Its decoded text, any BOM kept; `null` when Studio did not or could not
   * read it: it is unreadable, too large, not UTF-8 or a link, or the caller
   * must not read it.
   */
  text: string | null;
}

/** The mocks to add, and the files the edit is planned against. */
export interface PlanInput {
  /** The mocks file in the project root; `null` when there is none, so the edit creates it. */
  existing: ExistingMocksFile | null;
  /** The name a created file takes: `courier.mocks.ts` or `courier.mocks.mts`. */
  createName: string;
  /** The config file's name in the project root, e.g. `courier.config.ts`. */
  configName: string;
  /** The config's text, whose style a created file follows; `null` when it was not read. */
  configText: string | null;
  /**
   * Whether the project names the file of a relative import with the
   * extension it runs as, as Node's resolution of ES modules requires: a new
   * import of a `.ts` config then reads `./courier.config.js`, which
   * TypeScript maps back to the source. A mocks file whose own relative
   * imports end in `.js` or `.mjs` is written that way too.
   */
  explicitExtensions: boolean;
  /** The mocks to declare, already validated by the caller. */
  requests: readonly MockDeclaration[];
}

/** The file as the edit writes it, and the insertions that produce it. */
export interface MocksPlan {
  /** The whole file as written. */
  text: string;
  /**
   * The pure insertions that turn the text before the edit into `text`,
   * ascending, one per offset. A created file starts from "", so its edits
   * are one insertion at offset 0 holding the whole text.
   */
  edits: TextEdit[];
  /** The keys the existing object literal declares, in order; empty when creating or appending. */
  literalKeys: string[];
  /** Whether the file is created rather than edited. */
  creates: boolean;
  /**
   * The module specifier the planned file imports the config with: the one
   * of the existing import it reuses, or the one of the import it adds —
   * `./courier.config`, `./courier.config.cjs`, … The planner only knows
   * that a specifier of that shape names the config; the caller resolves it
   * from the mocks file, to refuse one that binds another file beside it.
   */
  configSpecifier: string;
}

/** How entries are written in one file. */
export interface EntryContext {
  /** `defineMockServer` as the file calls it. */
  serverCallee: string;
  /** The name the config's default export is read under. */
  configLocal: string;
  style: FileStyle;
  /**
   * Keep the text from ever reading `mocks:`. courier.config has no `mocks`
   * key and refuses one, so a snippet the user pastes must never look like
   * it declares mocks there.
   */
  guardMocksColon: boolean;
}

/** One field of a mock entry: its name and its value as written. */
export interface EntryField {
  name: string;
  value: string;
}

/** One mock entry a plan adds, as the audit expects to find it. */
export interface PlannedEntry {
  key: string;
  fields: readonly EntryField[];
}

/** An existing import declaration the plan adds names to. */
export interface ExtendedImport {
  /** Where the declaration starts in the text before the edit. */
  start: number;
  /** The names it gains, each imported under its own name. */
  names: readonly string[];
}

/** What a plan claims to add, checked against the text it produces. */
export interface PlannedInsertion {
  /** The mocks file's name, which also picks the parser's language. */
  fileName: string;
  /** The text before the edit; empty when the file is created. */
  oldText: string;
  /** The keys the object declared before the edit. */
  literalKeys: readonly string[];
  /** The entries added after them, in order. */
  entries: readonly PlannedEntry[];
  /** How the entries call `defineMockServer`: a local name, or `namespace.defineMockServer`. */
  serverCallee: string;
  /** The local name the config's default export is imported under. */
  configLocal: string;
  /** Every specifier that imports the config. */
  configSpecifiers: readonly string[];
  /** The exact text of each top-level statement the plan adds, in order. */
  addedStatements: readonly string[];
  /** The import declaration that gains names, if one does. */
  extendedImport: ExtendedImport | null;
}

/** A plan before it is checked, with the claims it is checked against. */
export interface MocksDraft {
  text: string;
  /** Insertions into {@link PlannedInsertion.oldText}, ascending, one per offset. */
  edits: TextEdit[];
  literalKeys: string[];
  /** The specifier the file imports the config with, as {@link MocksPlan.configSpecifier}. */
  configSpecifier: string;
  audit: PlannedInsertion;
}
