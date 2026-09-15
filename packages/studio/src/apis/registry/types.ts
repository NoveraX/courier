/**
 * Registry types — update-flow results consumed by the manage/update routes.
 */

import type { BreakingChange, MergeChange, MergeStatus, SpecDiff } from "../merge/types";

export type RemovedEndpointAction = "remove" | "keep" | "deprecate";

export interface UpdateChoices {
  /** Per-endpoint decisions for removed endpoints: endpointKey → action */
  removedActions: Record<string, RemovedEndpointAction>;
  /** Endpoint keys to include from new spec (defaults to all) */
  includeNew: string[];
}

export interface UpdateFileResult {
  path: string;
  content: string;
  status: MergeStatus;
  changes: MergeChange[];
}

export interface UpdateResult {
  files: UpdateFileResult[];
  /** File paths on disk that will be removed (not in new spec) */
  deletedFiles: string[];
  breakingChanges: BreakingChange[];
  /** API-level structural diff (present when old digest is available) */
  specDiff?: SpecDiff;
}
