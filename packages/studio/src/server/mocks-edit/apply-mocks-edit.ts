import { realpathSync } from "node:fs";
import { formatDuration } from "../format-duration";
import { ACT_BUDGET_MS, CONFIG_LOAD_TIMEOUT_MS } from "../project-state/budgets";
import { withinBudget } from "../within-budget";
import { editAlone } from "./edit-alone";
import { manualOutcome } from "./manual-outcome";
import type { MocksEditContext } from "./mocks-edit-context";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { snippetInputFromDisk } from "./snippet-input-from-disk";
import type { DeclareApplyResult } from "./types";
import type { DeclareBody } from "./validate-declare-body";

/**
 * Add the requested mocks to the mocks file, as the preview showed them.
 *
 * The whole edit holds the reload chain: the plan is made again against the
 * files as they are now and must be the one previewed, the file is written
 * atomically, and the edited files are loaded and checked before Studio
 * runs them. An edit that does not check out is taken back, and Studio
 * keeps running what it ran. Right after Studio starts, the edit queues
 * behind the first load. It waits out a load ahead of it that hangs, which
 * Studio gives up after `CONFIG_LOAD_TIMEOUT_MS`; when the chain stays
 * taken for longer than `ACT_BUDGET_MS` — loads queued ahead of it, one
 * after another — the edit is dropped before it starts and the wizard is told.
 *
 * @param ctx - The running Studio
 * @param body - The mocks, and the hashes of the preview the user confirmed
 * @returns What happened
 *
 * @example
 * ```ts
 * const result = await applyMocksEdit(ctx, { mocks, baseHash: preview.baseHash, planDigest: preview.planDigest });
 * ```
 */
export async function applyMocksEdit(
  ctx: MocksEditContext,
  body: DeclareBody,
): Promise<DeclareApplyResult> {
  let started = false;
  const dropped = new AbortController();
  const edit = ctx.project.runExclusive(
    async (tx): Promise<DeclareApplyResult | null> => {
      if (dropped.signal.aborted) return null;
      started = true;
      return editAlone(ctx, tx, body);
    },
    CONFIG_LOAD_TIMEOUT_MS,
    dropped.signal,
  );
  if (!(await withinBudget(edit, ACT_BUDGET_MS)) && !started) {
    dropped.abort();
    return studioBusy(ctx, body);
  }
  return (await edit) ?? studioBusy(ctx, body);
}

function studioBusy(ctx: MocksEditContext, body: DeclareBody): DeclareApplyResult {
  const refusal = new MocksEditRefusal(
    "STUDIO_BUSY",
    `Studio is still loading courier.config after ${formatDuration(ACT_BUDGET_MS)}, so it did not change anything. Try again once it has loaded.`,
  );
  const input = snippetInputFromDisk(realpathSync(ctx.projectRoot), body.mocks);
  return manualOutcome(refusal, input, input.existing?.name ?? null);
}
