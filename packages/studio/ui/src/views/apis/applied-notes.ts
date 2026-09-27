import type { AppliedFiles } from "./client-file-changes";

/** How many files an apply wrote, removed, kept as they were and left in a previous directory. */
export interface AppliedCounts {
  written: number;
  removed: number;
  kept: number;
  leftBehind?: number;
  /** Folders the apply emptied and could not remove. */
  unremoved?: readonly string[];
}

/**
 * Count files the way the messages say it.
 *
 * @param count - How many
 * @returns "1 file" or "`count` files"
 */
export function fileCount(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

function asTheyWere(count: number): string {
  return `left ${fileCount(count)} as ${count === 1 ? "it was" : "they were"}`;
}

/**
 * Say what an apply did to an import's files, after a head naming the
 * operation: what it wrote, removed with a copy kept, and left as it was.
 *
 * @param head - What happened to the import, such as "Updated pets"
 * @param counts - What the apply did
 * @returns The sentence for a toast
 * @example
 * ```ts
 * appliedMessage("Updated pets", { written: 2, removed: 1, kept: 0 });
 * // → "Updated pets: wrote 2 files; removed 1 file, keeping a copy"
 * ```
 */
export function appliedMessage(
  head: string,
  { written, removed, kept, leftBehind = 0, unremoved = [] }: AppliedCounts,
): string {
  const notes = [
    written > 0 ? `wrote ${fileCount(written)}` : "",
    removed > 0 ? `removed ${fileCount(removed)}, keeping a copy` : "",
    kept > 0 ? asTheyWere(kept) : "",
    leftBehind > 0 ? `left ${fileCount(leftBehind)} in its previous directory` : "",
    unremovedNote(unremoved),
  ].filter((note) => note !== "");
  return notes.length > 0 ? `${head}: ${notes.join("; ")}` : `${head}: no file changed`;
}

/**
 * Count what an apply Studio answered did.
 *
 * @param applied - Studio's answer to an apply
 * @returns The counts
 */
export function countsOf({ written, removed, kept, pruneFailures }: AppliedFiles): AppliedCounts {
  return {
    written: written.length,
    removed: removed.length,
    kept: kept.length,
    unremoved: pruneFailures.map((failure) => failure.path),
  };
}

/**
 * Say which folders an apply emptied and could not remove, so the user can.
 *
 * @param folders - The folders, project-relative
 * @returns The note, or "" when there are none
 * @example
 * ```ts
 * unremovedNote(["src/api/pets/old"]); // → "could not remove the emptied folder src/api/pets/old; delete it by hand"
 * ```
 */
export function unremovedNote(folders: readonly string[]): string {
  if (folders.length === 0) return "";
  const one = folders.length === 1;
  const what = one ? "the emptied folder" : `${folders.length} emptied folders`;
  return `could not remove ${what} ${folders.join(", ")}; delete ${one ? "it" : "them"} by hand`;
}
