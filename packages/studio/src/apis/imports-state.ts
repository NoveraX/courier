import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { COURIER_DIR, ensureCourierDir } from "../server/courier-dir";
import { writeFileAtomic } from "../server/fs-helpers";
import type { SpecDigest } from "./merge/types";

export { computeSpecHash } from "./registry/spec-hash";

const log = createLogger("Studio");

/** Current on-disk schema version */
export const IMPORTS_STATE_VERSION = 1 as const;

/** Default location relative to the project root */
export const IMPORTS_STATE_FILENAME = `${COURIER_DIR}/imports-state.json`;

/** Per-import auto-managed cache entry */
export interface ImportStateEntry {
  /** SHA-256 prefix of the last fetched spec */
  specHash: string;
  /** Compact spec snapshot used for API-level diffing */
  digest?: SpecDigest;
  /** ISO timestamp of the last successful fetch */
  fetchedAt: string;
  /** ISO timestamp of the last successful codegen run */
  lastSyncedAt: string;
  /** Endpoint identifiers the user has hand-edited */
  userModified: string[];
  /** Every file Studio wrote during the last codegen */
  generatedFiles: string[];
  /** SHA-256 fingerprints of generated files, used to detect manual edits */
  fileFingerprints: Record<string, string>;
}

/** Top-level shape of `.courier/imports-state.json` */
export interface ImportsState {
  version: typeof IMPORTS_STATE_VERSION;
  imports: Record<string, ImportStateEntry>;
}

/** Default empty state used when the file is missing or unreadable */
function emptyState(): ImportsState {
  return { version: IMPORTS_STATE_VERSION, imports: {} };
}

/** Resolve the absolute state path for a given project root */
export function resolveImportsStatePath(projectRoot: string): string {
  return join(projectRoot, IMPORTS_STATE_FILENAME);
}

/**
 * Read the imports-state file. Returns an empty state when the file is
 * missing, malformed, or written by a future schema version. Never throws —
 * the worst case is a fresh state, which the next `saveImportsState` rewrites.
 *
 * On corrupt JSON a `.corrupt` backup is created before returning empty state.
 * Individual entries that fail shape validation are dropped with a warning.
 */
export function loadImportsState(projectRoot: string): ImportsState {
  const path = resolveImportsStatePath(projectRoot);
  if (!existsSync(path)) return emptyState();
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    log.warn("Failed to read imports-state", err);
    return emptyState();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (parseErr) {
    /* Said before the backup is tried, so a backup that cannot be written
       does not leave the lost imports unexplained. */
    log.warn("Corrupt imports-state JSON; starting from an empty state", parseErr);
    try {
      writeFileSync(`${path}.corrupt`, raw, "utf-8");
      log.warn(`The corrupt imports-state was saved to ${path}.corrupt`);
    } catch (err) {
      log.warn(`Could not save the corrupt imports-state to ${path}.corrupt`, err);
    }
    return emptyState();
  }
  if (!isPlainObject(parsed)) return emptyState();
  if (parsed.version !== IMPORTS_STATE_VERSION) {
    log.warn(
      `imports-state version mismatch: expected ${IMPORTS_STATE_VERSION}, got ${String(parsed.version)}`,
    );
    return emptyState();
  }
  const imports = parsed.imports;
  if (!isPlainObject(imports)) return emptyState();
  const validated = Object.entries(imports).filter((pair): pair is [string, ImportStateEntry] => {
    if (isImportStateEntry(pair[1])) return true;
    log.warn(`Dropped invalid imports-state entry: ${pair[0]}`);
    return false;
  });
  /* fromEntries defines each key as its own, so an import named "__proto__"
     stays an entry instead of replacing the object's prototype. */
  return { version: IMPORTS_STATE_VERSION, imports: Object.fromEntries(validated) };
}

/** Atomically persist the imports-state file */
export function saveImportsState(projectRoot: string, state: ImportsState): void {
  const path = resolveImportsStatePath(projectRoot);
  const payload = `${JSON.stringify({ version: IMPORTS_STATE_VERSION, imports: state.imports }, null, 2)}\n`;
  ensureCourierDir(projectRoot);
  writeFileAtomic(path, payload);
}

/** Insert or replace a single import entry, returning the next state */
export function recordImport(
  state: ImportsState,
  name: string,
  entry: ImportStateEntry,
): ImportsState {
  return {
    version: IMPORTS_STATE_VERSION,
    imports: { ...state.imports, [name]: entry },
  };
}

/** Drop a single import entry, returning the next state */
export function removeImport(state: ImportsState, name: string): ImportsState {
  if (!Object.hasOwn(state.imports, name)) return state;
  const { [name]: _removed, ...rest } = state.imports;
  void _removed;
  return { version: IMPORTS_STATE_VERSION, imports: rest };
}

/** True when the recorded hash for `name` differs from `newHash` (or no record exists) */
export function hasSpecChanged(state: ImportsState, name: string, newHash: string): boolean {
  if (!Object.hasOwn(state.imports, name)) return true;
  const entry = state.imports[name];
  if (!entry) return true;
  return entry.specHash !== newHash;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isImportStateEntry(value: unknown): value is ImportStateEntry {
  if (!isPlainObject(value)) return false;
  if (typeof value.specHash !== "string") return false;
  if (typeof value.fetchedAt !== "string") return false;
  if (typeof value.lastSyncedAt !== "string") return false;
  if (!Array.isArray(value.userModified)) return false;
  if (!Array.isArray(value.generatedFiles)) return false;
  if (!isPlainObject(value.fileFingerprints)) return false;
  return true;
}
