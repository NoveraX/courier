import type { RequestEntry } from "../../store/types-request";
import type { Catalog } from "../../store/types-ui";
import { P95_SLOW_MS } from "./constants";
import type { AuditEndpoint, AuditItem, EndpointStats } from "./types";

function formatEp(s: EndpointStats): AuditEndpoint {
  return {
    key: s.key,
    label: s.group ? `${s.source}.${s.group}.${s.method}` : `${s.source}.${s.method}`,
    requestIds: s.requestIds,
  };
}

function slowEndpoints(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.p95 > P95_SLOW_MS && s.p95 <= 5000 && s.count >= 1,
  );
  if (matched.length === 0) return [];
  return [
    {
      id: "warn-slow",
      severity: "warning",
      category: "performance",
      title: "Slow endpoints",
      description: "P95 response time exceeds 1 second.",
      suggestion: "Consider caching, pagination, or backend optimization.",
      endpoints: matched.map((s) => ({
        ...formatEp(s),
        detail: `P95 = ${s.p95.toFixed(0)}ms`,
      })),
    },
  ];
}

function inconsistentSizes(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched: { s: EndpointStats; cv: number }[] = [];
  for (const [, s] of stats) {
    if (s.sizes.length < 3 || s.avgSize === 0) continue;
    const variance = s.sizes.reduce((sum, v) => sum + (v - s.avgSize) ** 2, 0) / s.sizes.length;
    const cv = Math.sqrt(variance) / s.avgSize;
    if (cv > 1.0) matched.push({ s, cv });
  }
  if (matched.length === 0) return [];
  return [
    {
      id: "warn-inconsistent-size",
      severity: "warning",
      category: "reliability",
      title: "Inconsistent response sizes",
      description: "Response size varies wildly across calls.",
      suggestion: "Check if the endpoint returns different shapes under different conditions.",
      endpoints: matched.map(({ s, cv }) => ({
        ...formatEp(s),
        detail: `CV = ${cv.toFixed(1)}`,
      })),
    },
  ];
}

const MIDDLEWARE_OVERHEAD_THRESHOLD = 0.3;

function middlewareOverhead(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.middlewareOverhead > MIDDLEWARE_OVERHEAD_THRESHOLD && s.count >= 1,
  );
  if (matched.length === 0) return [];
  return [
    {
      id: "warn-middleware-overhead",
      severity: "warning",
      category: "performance",
      title: "High middleware overhead",
      description: "Middleware takes more than 30% of total request time.",
      suggestion: "Review middleware chain — reduce, reorder, or cache expensive middleware.",
      endpoints: matched.map((s) => ({
        ...formatEp(s),
        detail: `${(s.middlewareOverhead * 100).toFixed(0)}% overhead`,
      })),
    },
  ];
}

function httpMethodMismatch(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter((s) => {
    if (!s.type || s.httpMethods.size === 0) return false;
    if (s.type === "query" && !s.httpMethods.has("GET")) return true;
    if (s.type === "mutation" && s.httpMethods.has("GET")) return true;
    return false;
  });
  if (matched.length === 0) return [];
  return [
    {
      id: "warn-method-mismatch",
      severity: "warning",
      category: "best-practices",
      title: "HTTP method mismatch",
      description:
        "Endpoint type doesn't match HTTP method (e.g. query using POST, mutation using GET).",
      suggestion: "Use GET for queries and POST/PUT/PATCH/DELETE for mutations.",
      endpoints: matched.map((s) => ({
        ...formatEp(s),
        detail: `type: ${s.type}, methods: ${[...s.httpMethods].join("/")}`,
      })),
    },
  ];
}

function repeatedValidationFailures(requests: RequestEntry[]): AuditItem[] {
  const failMap = new Map<string, { count: number; message: string; ids: string[] }>();

  for (const r of requests) {
    if (r.status !== "validation_error" || !r.error?.validationIssues) continue;
    for (const issue of r.error.validationIssues) {
      const key = `${r.source}:${r.group ?? ""}:${r.method}:${issue.message}`;
      const entry = failMap.get(key) ?? { count: 0, message: issue.message, ids: [] };
      entry.count++;
      entry.ids.push(r.id);
      failMap.set(key, entry);
    }
  }

  const repeated = [...failMap.values()].filter((e) => e.count >= 2);
  if (repeated.length === 0) return [];

  return [
    {
      id: "warn-repeated-validation",
      severity: "warning",
      category: "reliability",
      title: "Repeated validation failures",
      description: "Same validation error occurs repeatedly — likely a bug in the API contract.",
      suggestion: "Check if the response schema matches the actual API response shape.",
      endpoints: repeated.map((e) => ({
        key: e.message,
        label: e.message,
        detail: `${e.count}x`,
        requestIds: e.ids,
      })),
    },
  ];
}

/** Collect all warning-severity audit items. */
export function collectWarnings(
  stats: Map<string, EndpointStats>,
  _catalog: Catalog,
  requests: RequestEntry[],
): AuditItem[] {
  return [
    ...slowEndpoints(stats),
    ...inconsistentSizes(stats),
    ...middlewareOverhead(stats),
    ...httpMethodMismatch(stats),
    ...repeatedValidationFailures(requests),
  ];
}
