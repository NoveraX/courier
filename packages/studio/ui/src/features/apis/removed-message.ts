import type { AppliedFiles } from "@/apis/client-file-changes";
import { fileCount, unremovedNote } from "./applied-notes";

/**
 * Say what removing an import did: the config Studio took it out of, the
 * files moved into the backup, those left as they were, and the folders
 * Studio could not remove.
 *
 * @param name - The import
 * @param applied - What the removal did
 * @returns The sentence for a toast
 * @example
 * ```ts
 * removedMessage("pets", { removed: ["src/api/pets/source.ts"], kept: [], backupDir: ".courier/backups/1-a", pruneFailures: [], written: [] });
 * // → "Removed pets: moved 1 file into .courier/backups/1-a"
 * ```
 */
export function removedMessage(
  name: string,
  {
    removed,
    kept,
    backupDir,
    pruneFailures,
    undeclaredFrom,
  }: AppliedFiles & { undeclaredFrom?: string },
): string {
  const notes = [
    undeclaredFrom ? `took it out of ${undeclaredFrom}` : "",
    removed.length > 0 ? `moved ${fileCount(removed.length)} into ${backupDir ?? "a backup"}` : "",
    kept.length > 0
      ? `left ${fileCount(kept.length)} as ${kept.length === 1 ? "it was" : "they were"}`
      : "",
    unremovedNote(pruneFailures.map((failure) => failure.path)),
  ].filter((note) => note !== "");
  return notes.length > 0
    ? `Removed ${name}: ${notes.join("; ")}`
    : `Removed ${name}; none of its files were left to remove`;
}
