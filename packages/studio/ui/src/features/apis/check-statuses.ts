import type { SourceStatusInfo, SourceSummary } from "./types";

/** A status this page set itself, and the imports list it was set against. */
export interface PageStatus {
  info: SourceStatusInfo;
  /** The list it holds for; `null` while the check is under way, whatever list comes. */
  against: readonly SourceSummary[] | null;
}

/**
 * The status of each import's update check, as the cards show it: the
 * outcome Studio keeps and sends with the imports list, unless this page
 * knows better — a check under way, or the answer to its own check, which
 * holds until Studio sends the list anew with the outcome it kept.
 *
 * @param list - The imports list Studio sent last
 * @param page - The statuses this page set
 * @returns Each import's status, by name
 * @example
 * ```ts
 * checkStatuses(registrySources, { pets: { info: { status: "checking" }, against: null } }).pets?.status;
 * // → "checking"
 * ```
 */
export function checkStatuses(
  list: readonly SourceSummary[],
  page: Readonly<Record<string, PageStatus>>,
): Record<string, SourceStatusInfo> {
  const statuses: Record<string, SourceStatusInfo> = {};
  for (const { name, check } of list) {
    if (check)
      statuses[name] = { status: check.status, error: check.error, checkedAt: check.checkedAt };
  }
  for (const [name, { info, against }] of Object.entries(page)) {
    if (against === null || against === list) statuses[name] = info;
  }
  return statuses;
}
