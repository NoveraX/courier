import { isDeclareApplyResult } from "@/features/mocks/wizard/is-declare-apply-result";
import { isDeclarePreview } from "@/features/mocks/wizard/is-declare-preview";
import type {
  DeclareApplyBody,
  DeclareApplyResult,
  DeclarePreview,
  MockDeclaration,
} from "@/features/mocks/wizard/wire-types";
import { post } from "@/lib/api-client";

/** How the wizard asks Studio to plan and make the edit. */
export interface DeclareClient {
  preview(mocks: readonly MockDeclaration[]): Promise<DeclarePreview>;
  apply(body: DeclareApplyBody): Promise<DeclareApplyResult>;
}

const UNREADABLE = "Studio's answer could not be read, so the wizard shows nothing of it";

async function preview(mocks: readonly MockDeclaration[]): Promise<DeclarePreview> {
  const answer: unknown = await post("/api/mocks/declare/preview", { mocks });
  if (!isDeclarePreview(answer)) throw new Error(UNREADABLE);
  return answer;
}

async function apply(body: DeclareApplyBody): Promise<DeclareApplyResult> {
  const answer: unknown = await post("/api/mocks/declare/apply", body);
  if (!isDeclareApplyResult(answer)) {
    throw new Error(`${UNREADABLE}. Studio may or may not have changed the mocks file`);
  }
  return answer;
}

/**
 * Studio's routes for declaring mocks in `courier.mocks.ts`: a preview that
 * changes nothing, and an apply that makes exactly the change previewed.
 * An answer that is not the declared contract is refused as a whole, never
 * shown in part; a refusal Studio explains (400, 403, 500) arrives as an
 * `Error` carrying its reason.
 *
 * @example
 * ```ts
 * const plan = await declareClient.preview([
 *   { key: "apiMock", source: "api", port: null, seedCount: 20, autoStart: true },
 * ]);
 * if (plan.status === "ready") {
 *   await declareClient.apply({ mocks, baseHash: plan.baseHash, planDigest: plan.planDigest });
 * }
 * ```
 */
export const declareClient: DeclareClient = { preview, apply };
