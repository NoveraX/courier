/**
 * Performance audit hints — caching, proxy overhead, validation cost.
 *
 * Extracted from `rules-hints.ts` so each category lives in its own module.
 * Each rule scans the per-endpoint stats and emits at most a single audit
 * item describing the affected endpoints with attached detail strings
 * (overhead percentages, etc.).
 */

import type { AuditItem, EndpointStats } from "./types";
import { CACHE_SUGGESTION } from "./code-suggestions";
import { formatEndpoint } from "./hints-utils";

const PROXY_OVERHEAD_THRESHOLD = 0.5;
const VALIDATION_OVERHEAD_THRESHOLD = 0.2;

const FREQUENT_READS = 3;
const READ_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);

/** Reads answered successfully again and again that never went through a cache. */
export function noCachingDetected(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => !s.cached && isRead(s) && s.statusCodes.filter((c) => c >= 200 && c < 300).length >= FREQUENT_READS,
  );
  if (matched.length === 0) return [];
  return [{
    id: "hint-no-caching",
    severity: "hint",
    category: "performance",
    title: "No caching detected",
    description: "These reads are answered again and again, and none of their calls went through a cache.",
    suggestion: "Add cache middleware to reads whose answer can be reused for a while.",
    codeSuggestion: CACHE_SUGGESTION,
    endpoints: matched.map(formatEndpoint),
  }];
}

function isRead(s: EndpointStats): boolean {
  if (s.type) return s.type === "query";
  return s.httpMethods.size > 0 && [...s.httpMethods].every((m) => READ_METHODS.has(m));
}

export function proxyLatencyOverhead(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.proxyOverhead > PROXY_OVERHEAD_THRESHOLD && s.modes.has("proxy"),
  );
  if (matched.length === 0) return [];
  return [{
    id: "hint-proxy-overhead",
    severity: "hint",
    category: "performance",
    title: "High proxy overhead",
    description: "Proxy mode adds more than 50% latency overhead vs direct fetch.",
    suggestion: "Use direct mode for endpoints that don't need server-side secrets.",
    endpoints: matched.map((s) => ({
      ...formatEndpoint(s),
      detail: `${(s.proxyOverhead * 100).toFixed(0)}% overhead`,
    })),
  }];
}

export function validationOverhead(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.validationOverhead > VALIDATION_OVERHEAD_THRESHOLD,
  );
  if (matched.length === 0) return [];
  return [{
    id: "hint-validation-overhead",
    severity: "hint",
    category: "performance",
    title: "High validation overhead",
    description: "Schema validation takes more than 20% of total request time.",
    suggestion: "Simplify the schema or use a faster validation library.",
    endpoints: matched.map((s) => ({
      ...formatEndpoint(s),
      detail: `${(s.validationOverhead * 100).toFixed(0)}% of request time`,
    })),
  }];
}

export function inconsistentStatusCodes(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter((s) => {
    const successCodes = s.statusCodes.filter((c) => c >= 200 && c < 300);
    const unique = new Set(successCodes);
    return unique.size > 1;
  });
  if (matched.length === 0) return [];
  return [{
    id: "hint-inconsistent-status",
    severity: "hint",
    category: "best-practices",
    title: "Inconsistent status codes",
    description: "Same endpoint returns different success status codes (e.g. mix of 200/201/204).",
    suggestion: "Standardize success status codes for predictable client handling.",
    endpoints: matched.map((s) => {
      const unique = [...new Set(s.statusCodes.filter((c) => c >= 200 && c < 300))];
      return { ...formatEndpoint(s), detail: unique.join(", ") };
    }),
  }];
}
