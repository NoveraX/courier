import { createLogger } from "@noverax/courier";
import type { MocksEditRefusal } from "./mocks-edit-refusal";
import { buildMocksSnippet } from "./plan/mocks-snippet";
import type { PlanInput } from "./plan/types";
import type { ManualOutcome } from "./types";

const log = createLogger("Studio");

/**
 * Leave the edit to the user: say why, and give what to add by hand.
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
  log.debug(`Studio leaves adding mocks to the developer (${refusal.code})`, refusal);
  return {
    status: "manual",
    target,
    creates: input.existing === null,
    reasons: [{ code: refusal.code, source: refusal.source, message: refusal.message }],
    snippet: buildMocksSnippet(input),
    retryable: refusal.retryable,
  };
}
