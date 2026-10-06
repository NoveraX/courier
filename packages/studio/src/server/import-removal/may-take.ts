import type { FilePlan } from "../import-files/file-plan-types";

/**
 * Every file a removal may take: those it removes, and those waiting for
 * the user's leave to.
 *
 * @param plan - The removal's plan
 * @returns The files, project-relative
 * @example
 * ```ts
 * removalConfigNotes(root, name, running, mayTake(planned));
 * ```
 */
export function mayTake(plan: FilePlan): string[] {
  return [...plan.removals, ...plan.pending.flatMap((step) => step.removal ?? [])].map(
    (removal) => removal.path,
  );
}
