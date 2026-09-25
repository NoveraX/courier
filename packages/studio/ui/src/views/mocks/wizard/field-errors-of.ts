import type { DraftErrors, MockDraft } from "./types";
import type { FieldError } from "./wire-types";

/** Studio's field errors placed on the drafts they concern, and those that concern none. */
export interface PlacedFieldErrors {
  byDraft: Map<number, DraftErrors>;
  unplaced: string[];
}

/**
 * Place Studio's field errors on the drafts sent. An error names its draft
 * by position and by source; one whose position holds no draft of that
 * source — the drafts changed since they were sent — is kept apart, so it
 * is shown rather than put on the wrong mock.
 *
 * @param errors - The errors of an `invalid` answer
 * @param drafts - The drafts as they are now
 * @returns The errors by draft position, and the messages of the rest
 *
 * @example
 * ```ts
 * fieldErrorsOf(
 *   [{ index: 0, source: "api", field: "key", message: "courier.mocks.ts already declares api" }],
 *   [draftOf("api")],
 * );
 * // → { byDraft: Map { 0 => { key: "courier.mocks.ts already declares api" } }, unplaced: [] }
 * ```
 */
export function fieldErrorsOf(
  errors: readonly FieldError[],
  drafts: readonly MockDraft[],
): PlacedFieldErrors {
  const byDraft = new Map<number, DraftErrors>();
  const unplaced: string[] = [];
  for (const error of errors) {
    if (drafts[error.index]?.source !== error.source) {
      unplaced.push(`${error.source}: ${error.message}`);
      continue;
    }
    const current = byDraft.get(error.index) ?? {};
    byDraft.set(error.index, { ...current, [error.field]: current[error.field] ?? error.message });
  }
  return { byDraft, unplaced };
}
