import { buildDiffHunks } from "./diff-hunks";
import type { MocksEditContext } from "./mocks-edit-context";
import type { PreparedEdit } from "./prepare-edit";
import { restartingMocks } from "./restarting-mocks";
import type { ReadyOutcome } from "./types";

/**
 * The preview of a prepared edit: its diff, and what else it changes.
 *
 * @param ctx - The running Studio
 * @param prepared - The planned edit
 * @returns The outcome the wizard shows before the user confirms
 */
export async function readyOutcome(
  ctx: MocksEditContext,
  prepared: PreparedEdit,
): Promise<ReadyOutcome> {
  const { target, plan, intent } = prepared;
  const warnings = await intent.warnings(restartingMocks(ctx, prepared));
  return {
    status: "ready",
    target: target.relative,
    creates: plan.creates,
    baseHash: prepared.baseHash,
    planDigest: prepared.planDigest,
    hunks: buildDiffHunks(target.kind === "existing" ? target.text : "", plan.text, plan.edits),
    warnings,
  };
}
