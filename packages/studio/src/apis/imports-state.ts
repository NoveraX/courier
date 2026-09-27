import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { COURIER_DIR, ensureCourierDir } from "../server/courier-dir";
import { errnoCode } from "../server/errno-code";
import type { RecordedFile } from "../server/import-files/recorded-file";
import { writeFileAtomically } from "../server/project-fs/write-file-atomically";
import { isImportStateEntry, isPlainObject, readAppliedIds } from "./imports-state-guard";
import { keepStateCopy } from "./keep-state-copy";
import type { SpecDigest } from "./merge/types";

export { computeSpecHash } from "./registry/spec-hash";

const log = createLogger("Studio");

/** Current on-disk schema version */
export const IMPORTS_STATE_VERSION = 2 as const;

/** Default location relative to the project root */
export const IMPORTS_STATE_FILENAME = `${COURIER_DIR}/imports-state.json`;

/** What Studio records about one import it wrote. */
export interface ImportStateEntry {
  /** SHA-256 prefix of the spec the files were last generated from */
  specHash: string;
  /** Compact spec snapshot used for API-level diffing */
  digest?: SpecDigest;
  /** ISO timestamp of the last successful fetch */
  fetchedAt: string;
  /** ISO timestamp of the last successful codegen run */
  lastSyncedAt: string;
  /** The import's directory when Studio last wrote it, project-relative */
  dir: string;
  /** Every file Studio wrote and still owns, by project-relative path */
  files: Record<string, RecordedFile>;
  /** The apply that saved this record, which an unfinished apply of the import compares with */
  applyId?: string;
}

/** Top-level shape of `.courier/imports-state.json` */
export interface ImportsState {
  version: typeof IMPORTS_STATE_VERSION;
  imports: Record<string, ImportStateEntry>;
  /**
   * The ids of the latest applies to an import's files, oldest first, saved
   * with the record each one made: a restart undoes an unfinished apply
   * only when its id is not here.
   */
  applied: string[];
}

/** What reading the imports state found. */
export interface ReadImportsState {
  state: ImportsState;
  /**
   * `false` when the file held content Studio could neither read nor keep
   * a copy of, so saving over it would lose that content.
   */
  intact: boolean;
}

/** Default empty state used when the file is missing or unreadable */
function emptyState(): ImportsState {
  return { version: IMPORTS_STATE_VERSION, imports: {}, applied: [] };
}

/** Resolve the absolute state path for a given project root */
export function resolveImportsStatePath(projectRoot: string): string {
  return join(projectRoot, IMPORTS_STATE_FILENAME);
}

/**
 * Read the imports-state file, never throwing: a missing file is an empty
 * state, and so is one Studio cannot use — whose content is kept first, in
 * `.corrupt` for JSON that does not parse, `.v<version>` for another
 * version and `.invalid` for another shape or entries that fail
 * validation. A file Studio cannot read, or whose copy fails, is reported
 * as not intact, so nothing saves over it.
 *
 * @param projectRoot - The project directory
 * @returns The state, and whether saving over the file loses nothing
 * @example
 * ```ts
 * const { state, intact } = readImportsState(root);
 * ```
 */
export function readImportsState(projectRoot: string): ReadImportsState {
  const path = resolveImportsStatePath(projectRoot);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if (errnoCode(err) === "ENOENT") return { state: emptyState(), intact: true };
    log.warn("Failed to read imports-state", err);
    return { state: emptyState(), intact: false };
  }
  return parseState(path, raw);
}

/**
 * Read the imports-state file for display, as {@link readImportsState} does.
 *
 * @param projectRoot - The project directory
 * @returns The state; empty when the file is missing or unusable
 */
export function loadImportsState(projectRoot: string): ImportsState {
  return readImportsState(projectRoot).state;
}

function parseState(path: string, raw: string): ReadImportsState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    log.warn("Corrupt imports-state JSON; starting from an empty state", parseErr);
    return setAside(path, "corrupt", raw);
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.imports)) {
    log.warn("imports-state holds no imports object; starting from an empty state");
    return setAside(path, "invalid", raw);
  }
  if (parsed.version !== IMPORTS_STATE_VERSION) {
    const version = typeof parsed.version === "number" ? `v${parsed.version}` : "invalid";
    log.warn(
      `imports-state ${version} is not v${IMPORTS_STATE_VERSION}; starting from an empty state`,
    );
    return setAside(path, version, raw);
  }
  const validated = Object.entries(parsed.imports).filter(
    (pair): pair is [string, ImportStateEntry] => {
      if (isImportStateEntry(pair[1])) return true;
      log.warn(`Dropped invalid imports-state entry: ${pair[0]}`);
      return false;
    },
  );
  const complete = validated.length === Object.keys(parsed.imports).length;
  /* fromEntries defines each key as its own, so an import named "__proto__"
     stays an entry instead of replacing the object's prototype. */
  const imports = Object.fromEntries(validated);
  const state = {
    version: IMPORTS_STATE_VERSION,
    imports,
    applied: readAppliedIds(parsed.applied),
  };
  return { state, intact: complete || keepStateCopy(path, "invalid", raw) };
}

function setAside(path: string, suffix: string, raw: string): ReadImportsState {
  return { state: emptyState(), intact: keepStateCopy(path, suffix, raw) };
}

/** Atomically persist the imports-state file */
export function saveImportsState(projectRoot: string, state: ImportsState): void {
  const path = resolveImportsStatePath(projectRoot);
  const { imports, applied } = state;
  const payload = `${JSON.stringify({ version: IMPORTS_STATE_VERSION, imports, applied }, null, 2)}\n`;
  ensureCourierDir(projectRoot);
  writeFileAtomically(path, payload, ".courier.state");
}

/** Insert or replace a single import entry, returning the next state */
export function recordImport(
  state: ImportsState,
  name: string,
  entry: ImportStateEntry,
): ImportsState {
  return { ...state, imports: { ...state.imports, [name]: entry } };
}

/** Drop a single import entry, returning the next state */
export function removeImport(state: ImportsState, name: string): ImportsState {
  if (!Object.hasOwn(state.imports, name)) return state;
  const { [name]: _removed, ...rest } = state.imports;
  void _removed;
  return { ...state, imports: rest };
}

/** True when the recorded hash for `name` differs from `newHash` (or no record exists) */
export function hasSpecChanged(state: ImportsState, name: string, newHash: string): boolean {
  if (!Object.hasOwn(state.imports, name)) return true;
  const entry = state.imports[name];
  if (!entry) return true;
  return entry.specHash !== newHash;
}
