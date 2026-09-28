import { restartedByEdit } from "../mock-fingerprints";
import { buildDiffHunks } from "./diff-hunks";
import { editWarnings } from "./edit-warnings";
import type { MocksEditContext } from "./mocks-edit-context";
import type { PreparedEdit } from "./prepare-edit";
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
  const { target, plan, input } = prepared;
  const summaries = ctx.mockSummaries();
  const running = summaries.filter((mock) => mock.alive).map((mock) => mock.key);
  const warnings = await editWarnings({
    requests: input.requests,
    loaded: prepared.loaded,
    summaries,
    target: target.relative,
    restarting:
      target.kind === "existing"
        ? restartedByEdit({ file: target.path, before: target.text, after: plan.text, running })
        : [],
    creates: plan.creates,
    mockBasePort: ctx.mockBasePort,
  });
  return {
    status: "ready",
    target: target.relative,
    creates: plan.creates,
    baseHash: prepared.baseHash,
    planDigest: prepared.planDigest,
    hunks: buildDiffHunks(input.existing?.text ?? "", plan.text, plan.edits),
    warnings,
  };
}
