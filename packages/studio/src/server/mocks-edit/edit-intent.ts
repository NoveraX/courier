import type { LoadedCourierConfig } from "../config-loader";
import type { MocksEditRefusal } from "./mocks-edit-refusal";
import type { PreparedEdit } from "./prepare-edit";
import type { LoadState } from "./running-state";
import type { InvalidOutcome, ManualOutcome } from "./types";

/**
 * What a planned edit of the mocks file sets out to do — declaring mocks,
 * or adding endpoints to one — so it is shown, written, checked and taken
 * back the same way whichever edit it is.
 */
export interface EditIntent {
  /** The mocks it declares or changes, by key. */
  readonly keys: readonly string[];
  /** What to add by hand, when Studio does not make the edit itself. */
  readonly snippet: string;
  /** What the log says it did, between "Studio" and the file: `added users to`. */
  readonly did: string;
  /**
   * Why a load of the edited files is not the edit meant.
   *
   * @param before - What Studio ran before the edit
   * @param after - The load of the edited files
   * @returns The reason, or `null` when it is the edit meant
   */
  rejection(before: LoadedCourierConfig, after: LoadedCourierConfig): string | null;
  /**
   * What its preview warns of.
   *
   * @param restarting - The running mocks it restarts
   * @returns The warnings, in the order shown
   */
  warnings(restarting: readonly string[]): Promise<string[]>;
}

/** An edit of the mocks file as a page asked for it: how it is planned, and the preview the page confirmed. */
export interface MocksEditRequest {
  /**
   * Plan the edit against what Studio runs and what is on disk.
   *
   * @param state - What Studio runs now
   * @returns The prepared edit, the fields that cannot be as asked, or why to make it by hand
   */
  prepare(state: LoadState): Promise<PreparedEdit | InvalidOutcome | ManualOutcome>;
  /**
   * The edit to make by hand, when Studio cannot plan it at all.
   *
   * @param refusal - Why it cannot
   * @returns What the page is told
   */
  manual(refusal: MocksEditRefusal): ManualOutcome;
  /** sha256 of the file the previewed plan started from; `null` for a preview, or a file it creates. */
  readonly baseHash: string | null;
  /** sha256 of the file the previewed plan writes; `null` for a preview. */
  readonly planDigest: string | null;
}
