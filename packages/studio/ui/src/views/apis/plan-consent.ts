import type { FilePlanSummary, PlanConsent } from "./types-file-plan";

/**
 * Start the user's consent to a plan with the steps Studio offers ticked:
 * removing a file only Studio's header claims, never replacing or removing
 * one the user edited or Studio did not write.
 *
 * @param plan - The plan shown
 * @returns The consent, with the preselected steps allowed
 * @example
 * ```ts
 * consentFor(plan).confirmed; // → ["src/api/pets/old/index.ts"]
 * ```
 */
export function consentFor(plan: FilePlanSummary): PlanConsent {
  return {
    plan,
    confirmed: plan.pending.filter((step) => step.preselected).map((step) => step.path),
  };
}

/**
 * Allow a pending step, or withdraw allowing it.
 *
 * @param consent - The consent so far
 * @param path - The step's file
 * @returns The consent with the step toggled; a path the plan does not hold changes nothing
 */
export function toggleConfirmed(consent: PlanConsent, path: string): PlanConsent {
  if (!consent.plan.pending.some((step) => step.path === path)) return consent;
  const confirmed = consent.confirmed.includes(path)
    ? consent.confirmed.filter((allowed) => allowed !== path)
    : [...consent.confirmed, path];
  return { ...consent, confirmed };
}

/**
 * What a request quotes to apply the plan the user saw, with the steps they
 * allowed. A plan with blocked files is never applied, so it is not quoted:
 * the request plans afresh, once the user has dealt with them.
 *
 * @param consent - The plan shown and the steps allowed, or `null` when none was shown
 * @returns The request fields
 * @example
 * ```ts
 * post("/api/apis/imports/remove", { name, ...consentBody(consent) });
 * ```
 */
export function consentBody(consent: PlanConsent | null): {
  planDigest?: string;
  confirm?: string[];
} {
  if (consent === null || consent.plan.blocked.length > 0) return {};
  return { planDigest: consent.plan.digest, confirm: consent.confirmed };
}
