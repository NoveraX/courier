import {
  IMPORTS_STATE_FILENAME,
  type ImportStateEntry,
  readImportsState,
  recordImport,
  removeImport,
  saveImportsState,
} from "../../apis/imports-state";
import { hasJournal } from "./apply-journal";
import { ImportsStateUnsafeError } from "./imports-state-unsafe-error";
import { KEPT_BACKUPS } from "./prune-backups";

/**
 * Record an import's entry in the imports state, or drop it, at once, with
 * the id of the apply it records: the state is the commit of an apply, and
 * a restart tells a finished apply by its id there. The latest ids are
 * kept, and older ones only while their journal is still on disk. Called
 * with the imports lock held.
 *
 * @param root - The project directory
 * @param name - The import
 * @param entry - Its new record, or `null` to forget it
 * @param applyId - The apply this record commits
 * @throws {ImportsStateUnsafeError} When the state file could be neither read nor kept
 * @example
 * ```ts
 * saveImportEntry(root.path, "pets", recordAfterApply(previous, applied, spec, now), applyId);
 * ```
 */
export function saveImportEntry(
  root: string,
  name: string,
  entry: ImportStateEntry | null,
  applyId: string,
): void {
  const { state, intact } = readImportsState(root);
  if (!intact) throw new ImportsStateUnsafeError(IMPORTS_STATE_FILENAME);
  const next = entry === null ? removeImport(state, name) : recordImport(state, name, entry);
  const ids = [...next.applied.filter((id) => id !== applyId), applyId];
  /* An id whose journal is still there stays, or the next start would undo an apply that stands. */
  const applied = ids.filter((id, at) => at >= ids.length - KEPT_BACKUPS || hasJournal(root, id));
  saveImportsState(root, { ...next, applied });
}
