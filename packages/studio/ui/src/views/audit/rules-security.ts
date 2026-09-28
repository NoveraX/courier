import type { RequestEntry } from "../../store/types-request";
import type { Catalog } from "../../store/types-ui";
import type { AuditItem } from "./types";
import { AUTH_SUGGESTION } from "./code-suggestions";

const AUTH_HEADER_PATTERNS = [
  "authorization",
  "x-api-key",
  "api-key",
  "x-auth-token",
  "x-access-token",
];

function isAuthHeader(name: string): boolean {
  const lower = name.toLowerCase();
  if (AUTH_HEADER_PATTERNS.includes(lower)) return true;
  return /(?:key|token|auth|secret)/.test(lower);
}

function hasAuthHeader(headers?: Record<string, string>): boolean {
  if (!headers) return false;
  return Object.keys(headers).some(isAuthHeader);
}

/** Mutations called without any auth header. */
function mutationWithoutAuth(requests: RequestEntry[]): AuditItem[] {
  const mutations = requests.filter(
    (r) => r.type === "mutation" && !hasAuthHeader(r.requestHeaders),
  );
  if (mutations.length === 0) return [];

  const endpoints = new Map<string, string[]>();
  for (const r of mutations) {
    const label = r.group
      ? `${r.source}.${r.group}.${r.method}`
      : `${r.source}.${r.method}`;
    const ids = endpoints.get(label) ?? [];
    ids.push(r.id);
    endpoints.set(label, ids);
  }

  return [{
    id: "sec-mutation-no-auth",
    severity: "error",
    category: "security",
    title: "Mutations without authentication",
    description: "Mutation endpoints called without any auth header (Authorization, X-API-Key, etc.).",
    suggestion: "Add auth middleware or include authentication headers.",
    codeSuggestion: AUTH_SUGGESTION,
    endpoints: [...endpoints].map(([label, ids]) => ({
      key: label,
      label,
      detail: `${ids.length} calls`,
      requestIds: ids,
    })),
  }];
}

const LEAK_HEADERS = ["server", "x-powered-by", "x-aspnet-version", "x-debug"];
const VERSION_PATTERN = /\d+\.\d+/;

/** Response headers that leak server software and version. */
function serverVersionLeak(requests: RequestEntry[]): AuditItem[] {
  const leaks: { header: string; value: string; id: string }[] = [];

  for (const r of requests) {
    if (!r.headers) continue;
    for (const key of LEAK_HEADERS) {
      const value = r.headers[key];
      if (value && VERSION_PATTERN.test(value)) {
        leaks.push({ header: key, value, id: r.id });
      }
    }
  }

  if (leaks.length === 0) return [];

  const unique = [...new Set(leaks.map((l) => `${l.header}: ${l.value}`))];
  return [{
    id: "sec-server-leak",
    severity: "warning",
    category: "security",
    title: "Server version disclosure",
    description: `Response headers reveal server software: ${unique.join(", ")}.`,
    suggestion: "Remove or hide Server, X-Powered-By headers in production.",
    requestIds: leaks.map((l) => l.id),
  }];
}

const REQUIRED_SECURITY_HEADERS = [
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options",
];

/** Responses missing common security headers. */
function missingSecurityHeaders(requests: RequestEntry[]): AuditItem[] {
  const checked = requests.filter((r) => r.headers && r.status === "success");
  if (checked.length === 0) return [];

  const missing = REQUIRED_SECURITY_HEADERS.filter((h) =>
    checked.every((r) => !r.headers?.[h]),
  );
  if (missing.length === 0) return [];

  return [{
    id: "sec-missing-headers",
    severity: "hint",
    category: "security",
    title: "Missing security headers",
    description: `No responses include: ${missing.join(", ")}.`,
    suggestion: "Configure the backend to set these headers for defense-in-depth.",
  }];
}

/** Cookie forwarding to a different domain via proxy. */
function cookieForwarding(requests: RequestEntry[]): AuditItem[] {
  const proxyReqs = requests.filter(
    (r) => r.mode === "proxy" && r.requestHeaders?.cookie,
  );
  if (proxyReqs.length === 0) return [];

  return [{
    id: "sec-cookie-forwarding",
    severity: "warning",
    category: "security",
    title: "Cookies forwarded via proxy",
    description: "Proxy mode forwards browser cookies to the backend. Ensure the backend is trusted.",
    suggestion: "Review credentials setting — use 'same-origin' instead of 'include' if possible.",
    requestIds: proxyReqs.slice(0, 5).map((r) => r.id),
  }];
}

/** Collect all security audit items from raw requests. */
export function collectSecurityRules(
  requests: RequestEntry[],
  _catalog: Catalog,
): AuditItem[] {
  return [
    ...mutationWithoutAuth(requests),
    ...serverVersionLeak(requests),
    ...missingSecurityHeaders(requests),
    ...cookieForwarding(requests),
  ];
}
