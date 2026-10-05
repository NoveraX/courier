import type { AuditSearch } from "./audit-search";
import { summaryOf } from "./finding-view";
import type { AuditCategory, AuditItem, AuditSeverity } from "./types";

/** How many findings each severity has, and all of them. */
export type SeverityCounts = Readonly<Record<AuditSeverity | "all", number>>;

/** A category's findings still open, and its checks passed. */
export interface CategoryTally {
  open: number;
  passed: number;
}

/**
 * Whether a finding shows under the filters: its severity, its category,
 * and the search found in its title or summary, ignoring case.
 *
 * @param item - The finding
 * @param search - The filters
 * @returns Whether it shows
 * @example
 * ```ts
 * matchesFinding(item, { sev: "error", q: "timeout" });
 * ```
 */
export function matchesFinding(item: AuditItem, search: AuditSearch): boolean {
  if (search.sev && item.severity !== search.sev) return false;
  if (search.cat && item.category !== search.cat) return false;
  const query = (search.q ?? "").trim().toLowerCase();
  if (!query) return true;
  return `${item.title} ${summaryOf(item)}`.toLowerCase().includes(query);
}

/**
 * How many findings each severity has, and how many there are in all.
 *
 * @param items - The findings
 * @returns The counts
 * @example
 * ```ts
 * severityCounts(items).error; // 2
 * ```
 */
export function severityCounts(items: readonly AuditItem[]): SeverityCounts {
  const counts = { all: items.length, error: 0, warning: 0, hint: 0, pass: 0 };
  for (const item of items) counts[item.severity]++;
  return counts;
}

/**
 * A category's findings still open — errors, warnings and hints — and its
 * checks passed.
 *
 * @param items - The findings
 * @param category - The category
 * @returns Its tally
 * @example
 * ```ts
 * categoryTally(items, "performance"); // { open: 4, passed: 1 }
 * ```
 */
export function categoryTally(items: readonly AuditItem[], category: AuditCategory): CategoryTally {
  const own = items.filter((item) => item.category === category);
  const passed = own.filter((item) => item.severity === "pass").length;
  return { open: own.length - passed, passed };
}
