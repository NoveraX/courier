import type { FileOwnership, KeptReason, PlanConfirmation, PlannedWriteAction } from "./types-file-plan";

const WRITE_LABEL: Readonly<Record<Exclude<PlannedWriteAction, "unchanged">, string>> = {
  create: "new",
  replace: "replaced",
  merge: "merged",
};

const EDITED: ReadonlySet<FileOwnership> = new Set(["recorded-edited", "claimed-edited"]);

/**
 * Say what a write does to its file. A merge keeps the edits in the file,
 * and says so only when the file holds edits of the user's.
 *
 * @param action - What the write does
 * @param was - What the file was before it
 * @returns The note shown beside the file
 * @example
 * ```ts
 * writeLabel("merge", "recorded-edited"); // → "merged, your edits kept"
 * writeLabel("merge", "recorded"); // → "merged"
 * ```
 */
export function writeLabel(action: Exclude<PlannedWriteAction, "unchanged">, was: FileOwnership): string {
  return action === "merge" && EDITED.has(was) ? "merged, your edits kept" : WRITE_LABEL[action];
}

/** Why a file stays as it is. */
export const KEPT_LABEL: Readonly<Record<KeptReason, string>> = {
  "not-written-by-studio": "Studio did not write it",
  link: "a link, which Studio never writes through",
  "not-a-file": "not a file",
  unconfirmed: "not allowed",
  imported: "a file that stays imports it",
};

/**
 * Say what a pending step does and why it waits for the user.
 *
 * @param step - The step
 * @returns The sentence shown beside its checkbox
 * @example
 * ```ts
 * pendingLabel({ path: "a.ts", kind: "replace", reason: "foreign", preselected: false });
 * // → "Replace it: Studio did not write it for this import."
 * ```
 */
export function pendingLabel({ kind, reason }: PlanConfirmation): string {
  const verb = kind === "replace" ? "Replace it" : "Remove it";
  if (reason === "foreign") return `${verb}: Studio did not write it for this import.`;
  if (reason === "edited") return `${verb}: it holds edits of yours${kind === "replace" ? ", which replacing it loses" : ""}.`;
  return `${verb}: its header says Studio wrote it, but Studio has no record of that.`;
}
