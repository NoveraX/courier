import { SHOW_BUDGET_MS } from "../project-state/budgets";
import { declareRequest } from "./declare-request";
import type { MocksEditRequest } from "./edit-intent";
import type { MocksEditContext } from "./mocks-edit-context";
import { MocksEditRefusal } from "./mocks-edit-refusal";
import { readyOutcome } from "./ready-outcome";
import type { DeclarePreview, MockDeclaration } from "./types";

/**
 * Show what adding the requested mocks would change, without changing it.
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
export function previewMocksEdit(
  ctx: MocksEditContext,
  requests: readonly MockDeclaration[],
): Promise<DeclarePreview> {
  return previewEdit(
    ctx,
    declareRequest(ctx, { mocks: [...requests], baseHash: null, planDigest: null }),
  );
}

/**
 * Show what an edit of the mocks file would change, without changing it.
 *
 * A save not yet loaded would make the plan describe an older file, so a
 * preview first has Studio catch up with the saves on disk — right after
 * Studio starts, that is the first load. It waits `SHOW_BUDGET_MS` at most;
 * when Studio has not caught up by then, it says Studio is still loading
 * rather than plan against an older project, where a source the saved
 * config declares may be missing.
 *
 * @param ctx - The running Studio
 * @param request - The edit
 * @returns The diff to confirm, the fields to correct, or the reason to make it by hand
 *
 * @example
 * ```ts
 * const preview = await previewEdit(ctx, endpointsRequest(ctx, body));
 * ```
 */
export async function previewEdit(
  ctx: MocksEditContext,
  request: MocksEditRequest,
): Promise<DeclarePreview> {
  const view = await ctx.project.fresh(SHOW_BUDGET_MS);
  if (view.starting || view.settling) {
    return request.manual(
      new MocksEditRefusal(
        view.starting ? "STUDIO_STARTING" : "STUDIO_BUSY",
        "Studio is still loading courier.config; try again in a moment.",
      ),
    );
  }
  const prepared = await request.prepare(view);
  return prepared.status === "prepared" ? readyOutcome(ctx, prepared) : prepared;
}
