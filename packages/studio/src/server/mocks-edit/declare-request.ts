import { realpathSync } from "node:fs";

import type { MocksEditRequest } from "./edit-intent";
import { manualOutcome } from "./manual-outcome";
import type { MocksEditContext } from "./mocks-edit-context";
import { prepareEdit } from "./prepare-edit";
import { snippetInputFromDisk } from "./snippet-input-from-disk";
import type { DeclareBody } from "./validate-declare-body";

/**
 * Declaring mocks as the wizard asked: planned by `prepareEdit`, and left
 * to the user, when Studio cannot plan it, with the mocks to add to the
 * file as it is on disk.
 *
 * @param ctx - The running Studio
 * @param body - The mocks, and the hashes of the preview the user confirmed
 * @returns The request
 * @example
 * ```ts
 * await applyEdit(ctx, declareRequest(ctx, body));
 * ```
 */
export function declareRequest(ctx: MocksEditContext, body: DeclareBody): MocksEditRequest {
  return {
    prepare: (state) => prepareEdit(ctx, state, body.mocks),
    manual: (refusal) => {
      const input = snippetInputFromDisk(realpathSync(ctx.projectRoot), body.mocks);
      return manualOutcome(refusal, input, input.existing?.name ?? null);
    },
    baseHash: body.baseHash,
    planDigest: body.planDigest,
  };
}
