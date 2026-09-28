import type { RequestEntry } from "../../store/types-request";
import type { Catalog } from "../../store/types-ui";
import { computeEndpointStats } from "./compute-stats";
import { MAX_SCORE, SEVERITY_CONFIG } from "./constants";
import { collectDeepPerformance } from "./rules-deep";
import { collectCourierRules } from "./rules-courier";
import { collectErrors } from "./rules-errors";
import { collectHints, collectPasses } from "./rules-hints";
import { detectDuplicates, detectNPlusOne, detectWaterfall } from "./rules-patterns";
import { browserDirectCalls } from "./rules-proxy-mode";
import { collectSecurityRules } from "./rules-security";
import { collectWarnings } from "./rules-warnings";
import type { AuditContext, AuditItem, AuditResult, AuditSeverity } from "./types";

const SEVERITY_ORDER: AuditSeverity[] = ["error", "warning", "hint", "pass"];

/** Cap penalty per severity so one category can't zero the score. */
const MAX_PENALTY: Record<AuditSeverity, number> = {
  error: 60,
  warning: 30,
  hint: 10,
  pass: Infinity,
};

function computeScore(items: AuditItem[]): number {
  const penalties: Record<AuditSeverity, number> = { error: 0, warning: 0, hint: 0, pass: 0 };
  for (const item of items) {
    const sev = item.severity;
    const w = Math.abs(SEVERITY_CONFIG[sev].weight);
    penalties[sev] = Math.min(penalties[sev] + w, MAX_PENALTY[sev]);
  }
  const totalPenalty = penalties.error + penalties.warning + penalties.hint;
  const bonus = penalties.pass;
  return Math.max(0, Math.min(MAX_SCORE, MAX_SCORE - totalPenalty + bonus));
}

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

  const raw = [
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

  const items = sortBySeverity(deduplicateItems(raw));

  return {
    items,
    score: computeScore(items),
    breakdown: countBreakdown(items),
    timestamp: Date.now(),
  };
}
