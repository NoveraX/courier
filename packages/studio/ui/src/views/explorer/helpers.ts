import type { RequestEntry } from "@/store/types";

// ── HTTP method inference ───────────────────────────────────────────────────

const HTTP_HEURISTICS: [RegExp, string][] = [
  [/^(get|find|list|fetch|load|search|read|check)/i, "GET"],
  [/^(create|add|insert|register|submit|upload)/i, "POST"],
  [/^(update|edit|modify|replace|set)/i, "PUT"],
  [/^(patch|partial)/i, "PATCH"],
  [/^(delete|remove|destroy|drop|revoke)/i, "DELETE"],
];

/** Infers HTTP method from endpoint name and type */
export function inferHttpMethod(
  endpointType: "query" | "mutation" | "untyped",
  method: string,
): string {
  for (const [pattern, httpMethod] of HTTP_HEURISTICS) {
    if (pattern.test(method)) return httpMethod;
  }
  return endpointType === "mutation" ? "POST" : "GET";
}

// ── Endpoint key ────────────────────────────────────────────────────────────

export function formatEndpointKey(source: string, group: string, method: string): string {
  return `${source}.${group}.${method}`;
}

export function parseEndpointKey(key: string): { source: string; group: string; method: string } {
  const [source = "", group = "", method = ""] = key.split(".");
  return { source, group, method };
}

// ── Request filtering ───────────────────────────────────────────────────────

/**
 * Filters requests for a specific source/group/method combination.
 * Source matching is case-insensitive because server and client sessions
 * may register the same API under different-cased keys.
 *
 * An omitted `group` matches every group. A `""` group means the ungrouped
 * endpoints of a source, which the catalogue keys as `""` while their requests
 * carry no group at all — comparing the two directly matched nothing, so every
 * per-endpoint metric for a source without groups read zero.
 */
export function filterRequests(
  requests: RequestEntry[],
  source: string,
  group?: string,
  method?: string,
): RequestEntry[] {
  const srcLower = source.toLowerCase();
  return requests.filter((r) => {
    if (r.source.toLowerCase() !== srcLower) return false;
    if (group !== undefined && (r.group ?? "") !== group) return false;
    if (method !== undefined && r.method !== method) return false;
    return true;
  });
}
