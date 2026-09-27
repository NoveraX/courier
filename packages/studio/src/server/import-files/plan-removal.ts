import type { DiskFile } from "./disk-file";
import type { Confirmation, KeptReason, Ownership, PlannedRemoval } from "./file-plan-types";
import type { RecordedFile } from "./recorded-file";

/** What becomes of a file an operation no longer wants. */
export type RemovalOutcome =
  | { remove: PlannedRemoval; confirm?: Confirmation }
  | { keep: KeptReason }
  | { forget: true };

/**
 * Plan removing a file an operation no longer wants. Only Studio's own file,
 * untouched and holding nothing of the user's, is removed without asking; a
 * file Studio's header claims, or one the user changed, is removed once the
 * user allows it; a file Studio never wrote, a link and anything that is not
 * a regular file are left alone. A recorded file already gone is forgotten.
 *
 * @param path - The file, project-relative
 * @param disk - What is at its path now
 * @param ownership - Who that belongs to
 * @param record - What Studio recorded about it, if anything
 * @returns The outcome
 * @example
 * ```ts
 * planRemoval(path, disk, ownershipOf(disk, record, name), record);
 * ```
 */
export function planRemoval(
  path: string,
  disk: DiskFile,
  ownership: Ownership,
  record: RecordedFile | undefined,
): RemovalOutcome {
  if (disk.kind === "absent") return { forget: true };
  if (disk.kind === "link") return { keep: "link" };
  if (disk.kind === "not-a-file") return { keep: "not-a-file" };
  if (ownership === "foreign") return { keep: "not-written-by-studio" };
  const remove: PlannedRemoval = { path, was: ownership, priorSha256: disk.sha256 };
  if (ownership === "recorded" && record?.carriesEdits !== true) return { remove };
  const reason = ownership === "claimed" ? "claimed" : "edited";
  return { remove, confirm: { path, kind: "remove", reason, preselected: reason === "claimed" } };
}
