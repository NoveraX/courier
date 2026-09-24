import { realpathSync } from "node:fs";
import { withinBudget } from "../within-budget";
import { editAlone } from "./edit-alone";
import { LOAD_TIMEOUT_MS, SLOT_WAIT_MS } from "./edit-timing";
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
 * behind the first load. When the chain stays busy — a load that does not
 * finish — the edit is dropped before it starts and the wizard is told.
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
    LOAD_TIMEOUT_MS,
    dropped.signal,
  );
  if (!(await withinBudget(edit, SLOT_WAIT_MS)) && !started) {
    dropped.abort();
    return studioBusy(ctx, body);
  }
  return (await edit) ?? studioBusy(ctx, body);
}

function studioBusy(ctx: MocksEditContext, body: DeclareBody): DeclareApplyResult {
  const refusal = new MocksEditRefusal(
    "STUDIO_BUSY",
    `Studio is still loading courier.config after ${SLOT_WAIT_MS / 1000} s, so it did not change anything. Try again once it has loaded.`,
  );
  const input = snippetInputFromDisk(realpathSync(ctx.projectRoot), body.mocks);
  return manualOutcome(refusal, input, input.existing?.name ?? null);
}
