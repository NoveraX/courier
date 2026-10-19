/** Who a path in the project belongs to, as far as one import can tell. */
export type Ownership =
  /** Nothing is there. */
  | "absent"
  /** Studio recorded writing it, and it is as Studio wrote it. */
  | "recorded"
  /** Studio recorded writing it, and it changed since. */
  | "recorded-edited"
  /** No record, but its header says Studio wrote it for this import, and it is unchanged. */
  | "claimed"
  /** No record; its header says Studio wrote it for this import, but it changed since. */
  | "claimed-edited"
  /** A file Studio has no reason to think it wrote. */
  | "foreign"
  /** A symbolic link, which Studio never writes through, replaces or removes. */
  | "link"
  /** A directory, FIFO or anything else that is not a regular file. */
  | "not-a-file";

/**
 * How Studio arrives at a file it is about to write.
 * - `generated`: generated whole, such as a barrel or a grouped `source.ts`.
 * - `merge`: generated with endpoints, merged with the version on disk so
 *   the user's edits to endpoints survive.
 * - `derived`: computed from the version on disk, as managing endpoints does.
 */
export type TargetKind = "generated" | "merge" | "derived";

/** A file an operation wants in the project. */
export interface PlanTarget {
  /** Project-relative, `/` separated. */
  path: string;
  /** The content it should have, without Studio's header. */
  body: string;
  kind: TargetKind;
  /** The fingerprint of each endpoint as generated, to record. */
  endpoints: Record<string, string>;
  /**
   * The file on disk an endpoint file's group was written to before Studio
   * named it otherwise, which it is merged with in place of the file at its
   * own path, so the endpoints the user added or edited go with the group.
   */
  mergeFrom?: string;
}

/** What an operation asks of an import's files. */
export interface PlanRequest {
  importName: string;
  /** The import's directory; no path outside it is written or removed. */
  dir: string;
  targets: PlanTarget[];
  /** Files the operation no longer wants, if they are Studio's to remove. */
  removals: string[];
}

/**
 * A file the plan writes. An `unchanged` one already holds what it would
 * be written with: it is not written again, only recorded.
 */
export interface PlannedWrite {
  path: string;
  action: "create" | "replace" | "merge" | "unchanged";
  /** What is written, without Studio's header. */
  body: string;
  endpoints: Record<string, string>;
  /** The written body keeps edits the user made. */
  carriesEdits: boolean;
  was: Ownership;
  /** The SHA-256 of the body on disk when the plan was made, if there was one. */
  priorSha256?: string;
}

/** A file the plan moves out of the project, into the plan's backup. */
export interface PlannedRemoval {
  path: string;
  was: Ownership;
  priorSha256: string;
}

/**
 * Why a file the operation touched is left as it is: Studio did not write
 * it, it is a link or not a file, the user did not allow its step, or a
 * file that stays imports it.
 */
export type KeptReason =
  | "not-written-by-studio"
  | "link"
  | "not-a-file"
  | "unconfirmed"
  | "imported";

/** A step that only the user may allow. */
export interface Confirmation {
  path: string;
  kind: "replace" | "remove";
  reason: "edited" | "claimed" | "foreign";
  /** Whether the UI offers it ticked. */
  preselected: boolean;
}

/** A write or a removal that waits for the user to allow it. */
export interface PendingStep {
  confirmation: Confirmation;
  write?: PlannedWrite;
  removal?: PlannedRemoval;
}

/** An import's file changes, worked out before anything is touched. */
export interface FilePlan {
  importName: string;
  dir: string;
  writes: PlannedWrite[];
  removals: PlannedRemoval[];
  kept: Array<{ path: string; reason: KeptReason }>;
  /** Steps taken only once the user allows them; left out otherwise. */
  pending: PendingStep[];
  /** Recorded files that are gone from disk: they are forgotten. */
  forgotten: string[];
  /** Targets Studio cannot write at all; a plan with any is not applied. */
  blocked: Array<{ path: string; reason: "link" | "not-a-file" }>;
  /** Changes whenever the plan or anything on disk it rests on changes. */
  digest: string;
  /** How the files the plan writes were formatted, once they were; the digest covers their text. */
  formatting?: PlanFormatting;
}

/** How the files a plan writes were formatted, as the project formats its code. */
export interface PlanFormatting {
  /** The tools that formatted them, with their versions: `["Biome 2.5.14"]`; none when the project has none. */
  formattedWith: string[];
  /** Why a file, or every file, is written as Studio composed it; `null` when none is. */
  problem: string | null;
}
