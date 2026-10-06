import type { RequestEntry } from "@/store/types-request";
import type { Catalog } from "@/store/types-ui";
import { auditScore } from "./audit-score";
import { computeEndpointStats } from "./compute-stats";
import { passedChecks } from "./passed-checks";
import { collectCourierRules } from "./rules-courier";
import { collectDeepPerformance } from "./rules-deep";
import { detectDuplicates } from "./rules-duplicates";
import { collectErrors } from "./rules-errors";
import { collectHints, collectPasses } from "./rules-hints";
import { detectNPlusOne, detectWaterfall } from "./rules-patterns";
import { browserDirectCalls } from "./rules-proxy-mode";
import { collectSecurityRules } from "./rules-security";
import { collectWarnings } from "./rules-warnings";
import type { AuditContext, AuditItem, AuditResult, AuditSeverity } from "./types";

const SEVERITY_ORDER: AuditSeverity[] = ["error", "warning", "hint", "pass"];

function countBreakdown(items: AuditItem[]): Record<AuditSeverity, number> {
  const counts = { error: 0, warning: 0, hint: 0, pass: 0 };
  for (const item of items) counts[item.severity]++;
  return counts;
}

function deduplicateItems(items: AuditItem[]): AuditItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function sortBySeverity(items: AuditItem[]): AuditItem[] {
  return [...items].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
}

/**
 * Run the full audit engine against requests and catalog.
 *
 * @param requests - The captured requests
 * @param catalog - The endpoints known
 * @param context - What else the audit weighs: which sessions are browsers
 * @returns The items found, sorted by severity, and the score
 *
 * @example
 * ```ts
 * runAudit(requests, catalog, { browserSessions: new Set(["browser"]) });
 * ```
 */
export function runAudit(
  requests: RequestEntry[],
  catalog: Catalog,
  context: AuditContext,
): AuditResult {
  const completed = requests.filter((r) => r.status !== "pending");
  const stats = computeEndpointStats(completed);

  const found = [
    // Stats-based rules
    ...collectErrors(stats, catalog, completed),
    ...collectWarnings(stats, catalog, completed),
    ...browserDirectCalls(completed, context),
    ...collectHints(stats, catalog),
    ...collectPasses(stats),
    // Temporal pattern rules
    ...detectNPlusOne(completed),
    ...detectDuplicates(completed),
    ...detectWaterfall(completed),
    // Security rules
    ...collectSecurityRules(completed, catalog),
    // Deep performance rules
    ...collectDeepPerformance(completed),
    // Courier-specific rules
    ...collectCourierRules(stats, catalog),
  ];

  const items = sortBySeverity(deduplicateItems([...found, ...passedChecks(completed, found)]));

  return {
    items,
    score: auditScore(items),
    breakdown: countBreakdown(items),
    timestamp: Date.now(),
  };
}
