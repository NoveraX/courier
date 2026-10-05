import { CATEGORY_ORDER } from "./audit-meta";
import type { AuditCategory, AuditSeverity } from "./types";

/** The severities a finding can have, in the order the filter lists them. */
export const AUDIT_SEVERITIES: readonly AuditSeverity[] = ["error", "warning", "hint", "pass"];

/** The Audit page's own part of its address: each left out while it shows everything. */
export interface AuditSearch {
  /** Only findings of this severity. */
  sev?: AuditSeverity | undefined;
  /** Only findings of this category. */
  cat?: AuditCategory | undefined;
  /** Only findings whose title or summary holds this text. */
  q?: string | undefined;
}

function oneOf<TValue extends string>(values: readonly TValue[], raw: unknown): TValue | undefined {
  return values.find((value) => value === raw);
}

/**
 * Read the Audit page's filters from its address: a severity, a category
 * and a search, each kept only when it names something real. The search
 * stays as typed — the field reads it back.
 *
 * @param raw - The address's parameters
 * @returns The filters
 * @example
 * ```ts
 * validateAuditSearch({ sev: "error", cat: "nope", q: "slow" }); // { sev: "error", q: "slow" }
 * ```
 */
export function validateAuditSearch(raw: Record<string, unknown>): AuditSearch {
  const search: AuditSearch = {};
  const sev = oneOf(AUDIT_SEVERITIES, raw.sev);
  if (sev) search.sev = sev;
  const cat = oneOf(CATEGORY_ORDER, raw.cat);
  if (cat) search.cat = cat;
  if (typeof raw.q === "string" && raw.q) search.q = raw.q;
  return search;
}
