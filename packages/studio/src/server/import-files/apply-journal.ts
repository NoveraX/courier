import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { COURIER_DIR, ensureCourierDir } from "../courier-dir";
import { errnoCode } from "../errno-code";
import { isRecord } from "../mocks-edit/is-record";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import { writeFileAtomically } from "../project-fs/write-file-atomically";

const log = createLogger("Studio");

/** Where applies in progress keep their journals, relative to the project. */
export const JOURNAL_DIR = `${COURIER_DIR}/journal`;

/** One path an apply touches, and how to undo it. */
export interface JournalEntry {
  /** Project-relative path of the file in place. */
  path: string;
  /** `write` puts a file in place; `remove` moves it into the backup. */
  step: "write" | "remove";
  /** Whether a file was there before the apply. */
  existed: boolean;
  /** SHA-256 of the body Studio puts in place, for a write. */
  sha256?: string;
}

/** What an apply in progress wrote down so it can be undone after a crash. */
export interface ApplyJournal {
  id: string;
  importName: string;
  /** `committing` once anything in the project may have changed. */
  state: "staging" | "committing";
  /** Project-relative backup directory. */
  backupDir: string;
  entries: JournalEntry[];
  /** Project-relative directories the apply created, outermost first. */
  createdDirs: string[];
  /** Project-relative temporary files the apply staged. */
  temps: string[];
}

/**
 * Record an apply's journal, replacing any earlier version of it.
 *
 * @param root - The project directory
 * @param journal - The journal
 * @example
 * ```ts
 * saveJournal(root.path, { ...journal, state: "committing" });
 * ```
 */
export function saveJournal(root: string, journal: ApplyJournal): void {
  ensureCourierDir(root);
  ensureDirectoryOf(root);
  writeFileAtomically(
    journalPath(root, journal.id),
    `${JSON.stringify(journal, null, 2)}\n`,
    ".courier.journal",
  );
}

/**
 * Drop an apply's journal once it finished or was undone.
 *
 * @param root - The project directory
 * @param id - The apply's id
 */
export function dropJournal(root: string, id: string): void {
  try {
    retryOnWin32(() => unlinkSync(journalPath(root, id)), `Deleting the journal of apply ${id}`);
  } catch (error) {
    if (errnoCode(error) !== "ENOENT") throw error;
  }
}

/**
 * Tell whether an apply's journal is still on disk: one that committed but
 * could not be deleted keeps its id recorded until it is.
 *
 * @param root - The project directory
 * @param id - The apply's id
 * @returns Whether the journal exists
 */
export function hasJournal(root: string, id: string): boolean {
  return existsSync(journalPath(root, id));
}

/**
 * Read the journals applies left behind, oldest first. One that does not
 * parse is logged and skipped, and left in place for the developer.
 *
 * @param root - The project directory
 * @returns The journals
 */
export function readJournals(root: string): ApplyJournal[] {
  let names: string[];
  try {
    names = readdirSync(join(root, JOURNAL_DIR))
      .filter((name) => name.endsWith(".json"))
      .sort();
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return [];
    throw error;
  }
  const journals: ApplyJournal[] = [];
  for (const name of names) {
    const journal = parseJournal(readFileSync(join(root, JOURNAL_DIR, name), "utf8"));
    if (journal === null)
      log.warn(`Studio could not read ${JOURNAL_DIR}/${name}; it is left as it is`);
    else journals.push(journal);
  }
  return journals;
}

function ensureDirectoryOf(root: string): void {
  mkdirSync(join(root, JOURNAL_DIR), { recursive: true });
}

function journalPath(root: string, id: string): string {
  return join(root, JOURNAL_DIR, `${id}.json`);
}

function parseJournal(text: string): ApplyJournal | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    log.debug("An apply journal holds no JSON", error);
    return null;
  }
  return isJournal(value) ? value : null;
}

function isJournal(value: unknown): value is ApplyJournal {
  if (!isRecord(value)) return false;
  const { id, importName, state, backupDir, entries, createdDirs, temps } = value;
  return (
    typeof id === "string" &&
    typeof importName === "string" &&
    (state === "staging" || state === "committing") &&
    typeof backupDir === "string" &&
    Array.isArray(entries) &&
    entries.every(isEntry) &&
    isStrings(createdDirs) &&
    isStrings(temps)
  );
}

function isEntry(value: unknown): value is JournalEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.path === "string" &&
    (value.step === "write" || value.step === "remove") &&
    typeof value.existed === "boolean" &&
    (value.sha256 === undefined || typeof value.sha256 === "string")
  );
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
