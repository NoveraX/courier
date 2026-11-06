import { isDeclareApplyResult } from "@/features/mocks/wizard/is-declare-apply-result";
import { isDeclarePreview } from "@/features/mocks/wizard/is-declare-preview";
import type { DeclareApplyResult, DeclarePreview } from "@/features/mocks/wizard/wire-types";
import { post } from "@/lib/api-client";

/** The endpoints to add to the list a mock answers. */
export interface EndpointsAsked {
  /** The mock's key in `courier.mocks.ts`. */
  key: string;
  /** The endpoints, as `group.method`. */
  endpoints: readonly string[];
}

const UNREADABLE = "Studio's answer could not be read, so Studio shows nothing of it";

/**
 * Studio's routes for adding endpoints to the list a mock answers: a
 * preview that changes nothing, and an apply that makes exactly the change
 * previewed. They answer as the mock wizard's routes do, and an answer that
 * is not that contract is refused as a whole.
 *
 * @example
 * ```ts
 * const plan = await endpointsClient.preview({ key: "shop", endpoints: ["orders.refund"] });
 * if (plan.status === "ready") await endpointsClient.apply({ key: "shop", endpoints, baseHash: plan.baseHash, planDigest: plan.planDigest });
 * ```
 */
export const endpointsClient = {
  async preview(asked: EndpointsAsked): Promise<DeclarePreview> {
    const answer: unknown = await post("/api/mocks/endpoints/preview", asked);
    if (!isDeclarePreview(answer)) throw new Error(UNREADABLE);
    return answer;
  },
  async apply(
    asked: EndpointsAsked & { baseHash: string | null; planDigest: string },
  ): Promise<DeclareApplyResult> {
    const answer: unknown = await post("/api/mocks/endpoints/apply", asked);
    if (!isDeclareApplyResult(answer)) {
      throw new Error(`${UNREADABLE}. Studio may or may not have changed the mocks file`);
    }
    return answer;
  },
};
