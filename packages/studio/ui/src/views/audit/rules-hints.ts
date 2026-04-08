/**
 * Aggregator for the audit "hint" and "pass" rule families.
 *
 * The actual rule implementations live in sibling modules grouped by
 * category (validation, performance) — this file only re-exports the two
 * collectors that the audit runner imports.
 */

import type { Catalog } from "../../store/types-ui";
import type { AuditItem, EndpointStats } from "./types";
import { formatEndpoint } from "./hints-utils";
import {
  missingAllSchemas,
  noResponseValidation,
  noVariablesValidation,
} from "./hints-validation";
import {
  inconsistentStatusCodes,
  noCachingDetected,
  proxyLatencyOverhead,
  validationOverhead,
} from "./hints-performance";

/** Collect pass items for endpoints that meet all quality criteria. */
export function collectPasses(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) =>
      s.hasVariablesValidation &&
      s.hasResponseValidation &&
      s.errorRate < 0.05 &&
      s.p95 < 500 &&
      s.count >= 3,
  );
  if (matched.length === 0) return [];
  return [{
    id: "pass-healthy",
    severity: "pass",
    category: "best-practices",
    title: "Healthy endpoints",
    description: "Endpoints with schemas, low error rate, and fast response times.",
    endpoints: matched.map((s) => ({
      ...formatEndpoint(s),
      detail: `P95 = ${s.p95.toFixed(0)}ms`,
    })),
  }];
}

/** Collect all hint-severity audit items. */
export function collectHints(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  return [
    ...noCachingDetected(stats),
    ...noResponseValidation(stats),
    ...noVariablesValidation(stats),
    ...missingAllSchemas(stats, catalog),
    ...proxyLatencyOverhead(stats),
    ...validationOverhead(stats),
    ...inconsistentStatusCodes(stats),
  ];
}
