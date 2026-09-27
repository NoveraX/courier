import type { PlanConsent } from "./import-files/run-plan";

/**
 * Read what a request says the user saw and allowed of a plan: the digest
 * of the plan shown, and the paths whose pending step the user allowed.
 *
 * @param body - The request body
 * @returns The consent, or `null` when either field is of the wrong kind
 * @example
 * ```ts
 * const consent = readPlanConsent(req.body);
 * ```
 */
export function readPlanConsent(body: Record<string, unknown>): PlanConsent | null {
  const { planDigest, confirm } = body;
  if (planDigest !== undefined && typeof planDigest !== "string") return null;
  if (
    confirm !== undefined &&
    !(Array.isArray(confirm) && confirm.every((path) => typeof path === "string"))
  ) {
    return null;
  }
  return {
    ...(planDigest !== undefined && { planDigest }),
    ...(confirm !== undefined && { confirm }),
  };
}
