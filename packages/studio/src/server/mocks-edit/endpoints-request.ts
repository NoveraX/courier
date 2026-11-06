import type { MocksEditRequest } from "./edit-intent";
import { manualOutcomeOf } from "./manual-outcome";
import type { MocksEditContext } from "./mocks-edit-context";
import { endpointsSnippet, prepareEndpointsEdit } from "./prepare-endpoints-edit";
import type { EndpointsBody } from "./validate-endpoints-body";

/**
 * Adding endpoints to a mock's list as a page asked: planned by
 * `prepareEndpointsEdit`, and left to the user, when Studio cannot plan it,
 * with the names to append.
 *
 * @param ctx - The running Studio
 * @param body - The mock, the endpoints, and the hashes of the preview the user confirmed
 * @returns The request
 * @example
 * ```ts
 * await applyEdit(ctx, endpointsRequest(ctx, body));
 * ```
 */
export function endpointsRequest(ctx: MocksEditContext, body: EndpointsBody): MocksEditRequest {
  return {
    prepare: (state) => prepareEndpointsEdit(ctx, state, body),
    manual: (refusal) =>
      manualOutcomeOf(refusal, { target: null, creates: false, snippet: endpointsSnippet(body) }),
    baseHash: body.baseHash,
    planDigest: body.planDigest,
  };
}
