import { withinBudget } from "../within-budget";
import { SETTLE_BUDGET_MS } from "./edit-timing";
import type { MocksEditContext } from "./mocks-edit-context";
import { prepareEdit } from "./prepare-edit";
import { readyOutcome } from "./ready-outcome";
import { studioStarting } from "./studio-starting";
import type { DeclarePreview, MockDeclaration } from "./types";

/**
 * Show what adding the requested mocks would change, without changing it.
 *
 * A save the watcher has seen but not yet loaded would make the plan
 * describe an older file, so a preview first waits a little for it.
 *
 * @param ctx - The running Studio
 * @param requests - The mocks to add, validated in shape
 * @returns The diff to confirm, the fields to correct, or the reason to add them by hand
 */
export async function previewMocksEdit(
  ctx: MocksEditContext,
  requests: readonly MockDeclaration[],
): Promise<DeclarePreview> {
  const watcher = ctx.watcher();
  if (!watcher) return studioStarting(ctx.projectRoot, requests);
  await withinBudget(watcher.settled(), SETTLE_BUDGET_MS);
  const state = { current: watcher.getCurrent(), lastLoadError: watcher.lastLoadError() };
  const prepared = await prepareEdit(ctx, state, requests);
  return prepared.status === "prepared" ? readyOutcome(ctx, prepared) : prepared;
}
