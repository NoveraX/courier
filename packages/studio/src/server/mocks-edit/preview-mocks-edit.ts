import { SHOW_BUDGET_MS } from "../project-state/budgets";
import type { MocksEditContext } from "./mocks-edit-context";
import { prepareEdit } from "./prepare-edit";
import { readyOutcome } from "./ready-outcome";
import { studioLoading } from "./studio-loading";
import type { DeclarePreview, MockDeclaration } from "./types";

/**
 * Show what adding the requested mocks would change, without changing it.
 *
 * A save not yet loaded would make the plan describe an older file, so a
 * preview first has Studio catch up with the saves on disk — right after
 * Studio starts, that is the first load. It waits `SHOW_BUDGET_MS` at most;
 * when Studio has not caught up by then, it says Studio is still loading
 * rather than plan against an older project, where a source the saved
 * config declares may be missing.
 *
 * @param ctx - The running Studio
 * @param requests - The mocks to add, validated in shape
 * @returns The diff to confirm, the fields to correct, or the reason to add them by hand
 *
 * @example
 * ```ts
 * const preview = await previewMocksEdit(ctx, [{ key: "apiMock", source: "api", port: null, seedCount: 20, autoStart: false }]);
 * ```
 */
export async function previewMocksEdit(
  ctx: MocksEditContext,
  requests: readonly MockDeclaration[],
): Promise<DeclarePreview> {
  const view = await ctx.project.fresh(SHOW_BUDGET_MS);
  if (view.starting) return studioLoading(ctx.projectRoot, requests, "STUDIO_STARTING");
  if (view.settling) return studioLoading(ctx.projectRoot, requests, "STUDIO_BUSY");
  const prepared = await prepareEdit(ctx, view, requests);
  return prepared.status === "prepared" ? readyOutcome(ctx, prepared) : prepared;
}
