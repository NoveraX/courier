import type { RequestEntry } from "../../store/types-request";
import type { Catalog } from "../../store/types-ui";
import {
  ERROR_RATE_HIGH,
  LARGE_RESPONSE_BYTES,
  P95_TIMEOUT_MS,
} from "./constants";
import type { AuditEndpoint, AuditItem, EndpointStats } from "./types";
import {
  HEADER_TOKEN_SUGGESTION,
  RESPONSE_SCHEMA_SUGGESTION,
  RETRY_SUGGESTION,
  TIMEOUT_SUGGESTION,
} from "./code-suggestions";

function formatEp(s: EndpointStats): AuditEndpoint {
  return {
    key: s.key,
    label: s.group ? `${s.source}.${s.group}.${s.method}` : `${s.source}.${s.method}`,
    requestIds: s.requestIds,
  };
}

function highErrorRate(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.errorRate > ERROR_RATE_HIGH,
  );
  if (matched.length === 0) return [];
  return [{
    id: "err-high-error-rate",
    severity: "error",
    category: "reliability",
    title: "High error rate",
    description: "These endpoints fail more than 20% of the time.",
    suggestion: "Add retry middleware or investigate the root cause of failures.",
    codeSuggestion: RETRY_SUGGESTION,
    endpoints: matched.map((s) => ({
      ...formatEp(s),
      detail: `${(s.errorRate * 100).toFixed(0)}% errors (${s.count} calls)`,
    })),
  }];
}

function timeoutPatterns(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.p95 > P95_TIMEOUT_MS && s.count >= 1,
  );
  if (matched.length === 0) return [];
  return [{
    id: "err-timeout",
    severity: "error",
    category: "performance",
    title: "Timeout risk",
    description: "P95 response time exceeds 5 seconds.",
    suggestion: "Add a timeout option or optimize the backend endpoint.",
    codeSuggestion: TIMEOUT_SUGGESTION,
    endpoints: matched.map((s) => ({
      ...formatEp(s),
      detail: `P95 = ${(s.p95 / 1000).toFixed(1)}s`,
    })),
  }];
}

function oversizedResponses(stats: Map<string, EndpointStats>): AuditItem[] {
  const matched = [...stats.values()].filter(
    (s) => s.avgSize > LARGE_RESPONSE_BYTES,
  );
  if (matched.length === 0) return [];
  return [{
    id: "err-oversize",
    severity: "error",
    category: "performance",
    title: "Oversized responses",
    description: "Average response size exceeds 1 MB.",
    suggestion: "Paginate the response, use field selection, or compress the payload.",
    endpoints: matched.map((s) => ({
      ...formatEp(s),
      detail: `${(s.avgSize / 1_048_576).toFixed(1)} MB avg`,
    })),
  }];
}

function missingErrorHandling(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
): AuditItem[] {
  const matched = [...stats.values()].filter((s) => {
    if (s.errorRate === 0 || s.hasResponseValidation) return false;
    const ep = catalog[s.source]?.groups[s.group]?.endpoints[s.method];
    return ep && !ep.hasResponseSchema;
  });
  if (matched.length === 0) return [];
  return [{
    id: "err-no-error-handling",
    severity: "error",
    category: "reliability",
    title: "Errors without response validation",
    description: "Endpoints with errors but no response schema to validate them.",
    suggestion: "Add a response schema to catch malformed error responses early.",
    codeSuggestion: RESPONSE_SCHEMA_SUGGESTION,
    endpoints: matched.map(formatEp),
  }];
}

const SENSITIVE_PATTERNS = [
  /[?&](token|access_token|api_key|apikey|secret|password|auth|credential)=/i,
  /[?&][^=]*=eyJ[A-Za-z0-9_-]{20,}/,
];

function sensitiveDataInUrl(requests: RequestEntry[]): AuditItem[] {
  const matched: { url: string; id: string }[] = [];
  for (const r of requests) {
    if (!r.url) continue;
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(r.url)) {
        matched.push({ url: r.url, id: r.id });
        break;
      }
    }
  }
  if (matched.length === 0) return [];
  return [{
    id: "err-sensitive-url",
    severity: "error",
    category: "security",
    title: "Sensitive data in URL",
    description: "Tokens, passwords, or API keys detected in URL query parameters. URLs are logged in browser history, server logs, and proxies.",
    suggestion: "Move sensitive data to request headers (Authorization) or POST body.",
    codeSuggestion: HEADER_TOKEN_SUGGESTION,
    requestIds: matched.map((m) => m.id),
  }];
}

/** Collect all error-severity audit items. */
export function collectErrors(
  stats: Map<string, EndpointStats>,
  catalog: Catalog,
  requests: RequestEntry[],
): AuditItem[] {
  return [
    ...highErrorRate(stats),
    ...timeoutPatterns(stats),
    ...oversizedResponses(stats),
    ...missingErrorHandling(stats, catalog),
    ...sensitiveDataInUrl(requests),
  ];
}
