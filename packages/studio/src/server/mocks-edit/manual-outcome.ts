import { createLogger } from "@noverax/courier";
import type { MocksEditRefusal } from "./mocks-edit-refusal";
import { buildMocksSnippet } from "./plan/mocks-snippet";
import type { PlanInput } from "./plan/types";
import type { ManualOutcome } from "./types";

const log = createLogger("Studio");

/** What an edit left to the user is: where, whether it makes the file, and what to add. */
export interface ManualEdit {
  /** The mocks file relative to the project root, when there is one to name. */
  target: string | null;
  /** Whether the snippet is a whole new file. */
  creates: boolean;
  snippet: string;
}

/**
 * Leave the edit of declaring mocks to the user: say why, and give what to
 * add by hand.
 *
 * @param refusal - Why Studio does not make the edit
 * @param input - What the snippet is built from: the mocks file when there is one, or the file to create
 * @param target - The mocks file relative to the project root, when there is one to name
 * @returns The outcome the wizard shows
 */
export function manualOutcome(
  refusal: MocksEditRefusal,
  input: PlanInput,
  target: string | null,
): ManualOutcome {
  return manualOutcomeOf(refusal, {
    target,
    creates: input.existing === null,
    snippet: buildMocksSnippet(input),
  });
}

/**
 * Leave an edit of the mocks file to the user, whichever edit it is: say
 * why, and give what to add by hand.
 *
 * @param refusal - Why Studio does not make the edit
 * @param edit - Where, whether it makes the file, and what to add
 * @returns The outcome the page shows
 */
export function manualOutcomeOf(refusal: MocksEditRefusal, edit: ManualEdit): ManualOutcome {
  log.debug(`Studio leaves its edit of the mocks file to the developer (${refusal.code})`, refusal);
  return {
    status: "manual",
    target: edit.target,
    creates: edit.creates,
    reasons: [{ code: refusal.code, source: refusal.source, message: refusal.message }],
    snippet: edit.snippet,
    retryable: refusal.retryable,
  };
}
