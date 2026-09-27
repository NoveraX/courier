import { isRecordedFiles } from "../server/import-files/recorded-file";
import type { ImportStateEntry } from "./imports-state";

/**
 * Whether a value is an object whose fields can be read by name.
 *
 * @param value - Anything parsed from JSON
 * @returns `true` for a non-array object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Whether a value is an import's record as Studio saves it: every file it
 * lists lies inside the import's directory.
 *
 * @param value - One entry of the state's `imports`
 * @returns Whether it is a valid entry
 */
export function isImportStateEntry(value: unknown): value is ImportStateEntry {
  if (!isPlainObject(value)) return false;
  if (typeof value.specHash !== "string") return false;
  if (typeof value.fetchedAt !== "string") return false;
  if (typeof value.lastSyncedAt !== "string") return false;
  if (typeof value.dir !== "string" || value.dir === "") return false;
  if (!isRecordedFiles(value.files)) return false;
  const inDir = `${value.dir}/`;
  return Object.keys(value.files).every((path) => path.startsWith(inDir));
}

/**
 * Read the ids of the applies the state recorded, keeping only strings.
 *
 * @param value - The state's `applied` field
 * @returns The ids, oldest first
 */
export function readAppliedIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}
