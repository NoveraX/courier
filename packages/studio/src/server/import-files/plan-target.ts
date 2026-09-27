import { generateFingerprints } from "../../apis/merge/fingerprint";
import { previewUpdate } from "../../apis/merge/update-flow";
import type { DiskFile } from "./disk-file";
import type { Confirmation, Ownership, PlannedWrite, PlanTarget } from "./file-plan-types";
import type { RecordedFile } from "./recorded-file";

/** What becomes of one target: written, written once the user allows it, or not at all. */
export type TargetOutcome =
  | { write: PlannedWrite; confirm?: Confirmation }
  | { blocked: "link" | "not-a-file" };

type ExistingFile = Extract<DiskFile, { kind: "file" }>;

/**
 * Plan one file an operation wants: create it, replace it, merge it with the
 * version on disk, or ask first. Studio's own untouched file is replaced; an
 * endpoint file is merged so the user's edits to endpoints survive; a file
 * the user changed in a way the merge would not keep, or one Studio never
 * wrote, is replaced only once the user allows it. A link or anything that
 * is not a regular file blocks the target.
 *
 * @param target - The file wanted
 * @param disk - What is at its path now
 * @param ownership - Who that belongs to
 * @param record - What Studio recorded about it, if anything
 * @returns The outcome
 * @example
 * ```ts
 * const outcome = planTarget(target, disk, ownershipOf(disk, record, name), record);
 * ```
 */
export function planTarget(
  target: PlanTarget,
  disk: DiskFile,
  ownership: Ownership,
  record: RecordedFile | undefined,
): TargetOutcome {
  if (disk.kind === "link" || disk.kind === "not-a-file") return { blocked: disk.kind };
  if (disk.kind === "absent") return { write: written(target, "create", target.body, ownership) };
  const body = target.kind === "merge" ? mergedBody(target, disk, ownership, record) : target.body;
  const carriesEdits =
    target.kind === "derived"
      ? (record?.carriesEdits ?? false) || ownership.endsWith("-edited")
      : body !== target.body;
  /* Only a generated file is replaced whole; a merged or derived one keeps what the user wrote. */
  const action =
    body === disk.body ? "unchanged" : target.kind === "generated" ? "replace" : "merge";
  const write = {
    ...written(target, action, body, ownership),
    carriesEdits,
    priorSha256: disk.sha256,
  };
  const reason = confirmationReason(target, disk, ownership, body, record);
  return reason === null
    ? { write }
    : { write, confirm: { path: target.path, kind: "replace", reason, preselected: false } };
}

function written(
  target: PlanTarget,
  action: PlannedWrite["action"],
  body: string,
  was: Ownership,
): PlannedWrite {
  return { path: target.path, action, body, endpoints: target.endpoints, carriesEdits: false, was };
}

function mergedBody(
  target: PlanTarget,
  disk: ExistingFile,
  ownership: Ownership,
  record: RecordedFile | undefined,
): string {
  const fingerprints =
    ownership === "claimed"
      ? generateFingerprints(disk.body)
      : ownership === "recorded" || ownership === "recorded-edited"
        ? (record?.endpoints ?? {})
        : {};
  const merged = previewUpdate(fingerprints, [{ path: target.path, content: target.body }], {
    [target.path]: disk.body,
  });
  return merged.files[0]?.content ?? target.body;
}

function confirmationReason(
  target: PlanTarget,
  disk: ExistingFile,
  ownership: Ownership,
  body: string,
  record: RecordedFile | undefined,
): Confirmation["reason"] | null {
  if (ownership === "foreign") return "foreign";
  if (target.kind === "derived") return null;
  /* A file holds the user's edits when it changed since Studio wrote it, or
     when Studio last wrote it keeping edits of theirs, as managing does. */
  const edited = ownership.endsWith("-edited") || record?.carriesEdits === true;
  if (!edited) return null;
  /* A generated file is replaced whole; an endpoint file whose merge kept
     nothing of the user's version would be too. */
  const keepsTheirs = target.kind === "merge" && body !== target.body;
  return keepsTheirs || disk.body === target.body ? null : "edited";
}
