import { extractEndpoints } from "../../apis/merge/extract-endpoints";
import { generateFingerprints } from "../../apis/merge/fingerprint";
import { computeHash } from "../../apis/merge/hash";
import { previewUpdate } from "../../apis/merge/update-flow";
import { ownValue } from "../../apis/own-value";
import type { DiskFile } from "./disk-file";
import type { Confirmation, Ownership, PlannedWrite, PlanTarget } from "./file-plan-types";
import type { RecordedFile } from "./recorded-file";

/** What becomes of one target: written, written once the user allows it, or not at all. */
export type TargetOutcome =
  | { write: PlannedWrite; confirm?: Confirmation }
  | { blocked: "link" | "not-a-file" };

type ExistingFile = Extract<DiskFile, { kind: "file" }>;

/** The file a target is merged with in place of the file at its path, with whose it is and what Studio recorded. */
export interface MergeBase {
  disk: ExistingFile;
  ownership: Ownership;
  record: RecordedFile | undefined;
}

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
 * @param removing - The files the operation removes, which a merged file stops importing once nothing it keeps uses them
 * @param base - The file a renamed group was written to, merged with in place of the file at the target's path
 * @returns The outcome
 * @example
 * ```ts
 * const outcome = planTarget(target, disk, ownershipOf(disk, record, name), record, removals);
 * ```
 */
export function planTarget(
  target: PlanTarget,
  disk: DiskFile,
  ownership: Ownership,
  record: RecordedFile | undefined,
  removing: readonly string[],
  base?: MergeBase,
): TargetOutcome {
  if (disk.kind === "link" || disk.kind === "not-a-file") return { blocked: disk.kind };
  const from = base ?? (disk.kind === "file" ? { disk, ownership, record } : undefined);
  /* A file the merge cannot read is replaced whole, and only once the user allows it. */
  const merged =
    target.kind === "merge" && from !== undefined
      ? mergedBody(target, from.disk, from.ownership, from.record, removing)
      : null;
  if (disk.kind === "absent") {
    const body = merged ?? target.body;
    return {
      write: { ...written(target, "create", body, ownership), carriesEdits: body !== target.body },
    };
  }
  const body = merged ?? target.body;
  const whole = target.kind === "generated" || (target.kind === "merge" && merged === null);
  const carriesEdits =
    target.kind === "derived"
      ? (record?.carriesEdits ?? false) || ownership.endsWith("-edited")
      : body !== target.body;
  /* Only a generated file is replaced whole; a merged or derived one keeps what the user wrote.
     A file without Studio's header for this import is written even when its text is the same,
     so that, once the user allows it, the header comes back. */
  const unchanged = body === disk.body && ownership !== "foreign";
  const action = unchanged ? "unchanged" : whole ? "replace" : "merge";
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

/* The fingerprints the file's endpoints were written with, which tell the user's edits apart. */
function writtenFingerprints(
  disk: ExistingFile,
  ownership: Ownership,
  record: RecordedFile | undefined,
): Record<string, string> {
  if (ownership === "claimed") return generateFingerprints(disk.body);
  return ownership === "recorded" || ownership === "recorded-edited"
    ? (record?.endpoints ?? {})
    : {};
}

/* Whether the merge leaves out an endpoint the user edited: its edits would go with it. */
function dropsEditedEndpoint(
  disk: ExistingFile,
  fingerprints: Record<string, string>,
  merged: string,
): boolean {
  const kept = extractEndpoints(merged);
  return Object.entries(extractEndpoints(disk.body)).some(([name, code]) => {
    const written = ownValue(fingerprints, name);
    return written !== undefined && computeHash(code) !== written && !Object.hasOwn(kept, name);
  });
}

/* The target merged with the file on disk, or `null` when the file cannot be read to merge. */
function mergedBody(
  target: PlanTarget,
  disk: ExistingFile,
  ownership: Ownership,
  record: RecordedFile | undefined,
  removing: readonly string[],
): string | null {
  const fingerprints = writtenFingerprints(disk, ownership, record);
  const [merged] = previewUpdate(
    fingerprints,
    [{ path: target.path, content: target.body }],
    { [target.path]: disk.body },
    removing,
  ).files;
  if (merged === undefined) return target.body;
  return merged.status === "conflict" ? null : merged.content;
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
  if (disk.body === target.body) return null;
  /* A generated file is replaced whole. An endpoint file is merged: it waits
     for the user when the merge kept nothing of theirs, or left out an
     endpoint they edited, whatever else of theirs it kept. */
  if (target.kind !== "merge" || body === target.body) return "edited";
  return dropsEditedEndpoint(disk, writtenFingerprints(disk, ownership, record), body)
    ? "edited"
    : null;
}
