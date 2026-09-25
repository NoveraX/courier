/**
 * What the mock wizard and Studio say to each other through
 * `POST /api/mocks/declare/preview` and `POST /api/mocks/declare/apply`.
 * It mirrors the server's contract; every answer is checked by
 * `isDeclarePreview` or `isDeclareApplyResult` before the wizard keeps it.
 */

/** One mock the wizard asks Studio to declare in `courier.mocks.ts`. */
export interface MockDeclaration {
  /** The mock's key in `courier.mocks.ts`. */
  key: string;
  /** The key of the source it serves under `sources` in `courier.config`. */
  source: string;
  /** A port held exactly, or `null` for one Studio assigns. */
  port: number | null;
  /** Records per collection. */
  seedCount: number;
  /** Whether Studio starts it at launch. */
  autoStart: boolean;
}

/** One line of a diff, numbered in the file before and after the edit. */
export interface DiffLine {
  kind: "context" | "add" | "remove";
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

/** A run of changed lines with up to three lines of context around it. */
export interface DiffHunk {
  lines: DiffLine[];
}

/** A line Studio wrote into, numbered in the file as written. */
export interface InsertedLine {
  line: number;
  /** The whole line as written. */
  text: string;
  /** What Studio added on it: the whole line, or the part inserted into a line that was there. */
  added: string;
}

/** Every reason Studio gives for leaving the edit to the user. */
export const REFUSAL_CODES = [
  "STUDIO_STARTING",
  "STUDIO_BUSY",
  "NO_CONFIG",
  "CONFIG_LOAD_FAILING",
  "CONFIG_SHADOWED",
  "MOCKS_LOAD_FAILING",
  "MOCKS_CHANGED_SINCE_LOAD",
  "MOCKS_IS_LINK",
  "MOCKS_NOT_REGULAR",
  "MOCKS_HARD_LINKED",
  "MOCKS_NOT_OWNED",
  "MOCKS_NOT_WRITABLE",
  "MOCKS_TOO_LARGE",
  "MOCKS_JAVASCRIPT",
  "MOCKS_GENERATED",
  "NOT_UTF8",
  "PARSE_ERROR",
  "MOCKS_COMMONJS",
  "MOCKS_NOT_LITERAL",
  "MOCKS_KEYS_HIDDEN",
  "IMPORT_NAME_TAKEN",
  "MOCK_PACKAGE_UNLOADABLE",
  "INTERNAL_PLAN_REJECTED",
  "WRITE_FAILED",
  "NOT_LOCAL_PEER",
] as const;

export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** Why Studio will not make the edit itself. */
export interface ManualReason {
  code: RefusalCode;
  /** The source the reason concerns, or `null` when it concerns the whole edit. */
  source: string | null;
  message: string;
}

/** The fields of a declaration Studio checks. */
export type DeclarationField = "key" | "source" | "port" | "seedCount";

/** A field of one declaration that cannot be declared as asked. */
export interface FieldError {
  /** The position of the declaration in the request. */
  index: number;
  /** The source that declaration names. */
  source: string;
  field: DeclarationField;
  message: string;
}

export interface InvalidOutcome {
  status: "invalid";
  errors: FieldError[];
}

export interface ManualOutcome {
  status: "manual";
  /** The mocks file, relative to the project root; `null` when there is none to name. */
  target: string | null;
  /** Whether the snippet is a whole new file. */
  creates: boolean;
  reasons: ManualReason[];
  /** What to add by hand. */
  snippet: string;
  /** Whether asking again may succeed without the user changing anything. */
  retryable: boolean;
}

export interface ReadyOutcome {
  status: "ready";
  target: string;
  creates: boolean;
  /** sha256 of the file the plan starts from; `null` when it creates the file. */
  baseHash: string | null;
  /** sha256 of the file as the plan would write it. */
  planDigest: string;
  hunks: DiffHunk[];
  warnings: string[];
}

export type DeclarePreview = ReadyOutcome | ManualOutcome | InvalidOutcome;

export interface AppliedOutcome {
  status: "applied";
  target: string;
  keys: string[];
  warnings: string[];
}

export interface StaleOutcome {
  status: "stale";
  plan: DeclarePreview;
}

export interface RolledBackOutcome {
  status: "rolledBack";
  target: string;
  creates: boolean;
  reason: string;
  snippet: string;
}

export interface NotVerifiedOutcome {
  status: "notVerified";
  target: string;
  reason: string;
  insertedLines: InsertedLine[];
}

export interface RollbackFailedOutcome {
  status: "rollbackFailed";
  target: string;
  reason: string;
  insertedLines: InsertedLine[];
}

export type DeclareApplyResult =
  | AppliedOutcome
  | StaleOutcome
  | InvalidOutcome
  | ManualOutcome
  | RolledBackOutcome
  | NotVerifiedOutcome
  | RollbackFailedOutcome;

/** What an apply sends: the declarations previewed, and the hashes of that preview. */
export interface DeclareApplyBody {
  mocks: MockDeclaration[];
  baseHash: string | null;
  planDigest: string;
}
