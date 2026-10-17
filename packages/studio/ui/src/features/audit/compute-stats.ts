import type { RequestEntry } from "@/store/types-request";
import type { EndpointStats } from "./types";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

export function buildKey(r: RequestEntry): string {
  return `${r.source}:${r.group ?? ""}:${r.method}`;
}

function createEmptyStats(r: RequestEntry, key: string): EndpointStats {
  return {
    key,
    source: r.source,
    group: r.group ?? "",
    method: r.method,
    avgDuration: 0,
    p95: 0,
    errorRate: 0,
    count: 0,
    sizes: [],
    avgSize: 0,
    hasVariablesValidation: false,
    hasResponseValidation: false,
    sentVariables: false,
    modes: new Set(),
    statusCodes: [],
    middlewareOverhead: 0,
    validationOverhead: 0,
    proxyOverhead: 0,
    httpMethods: new Set(),
    type: r.type,
    requestIds: [],
    cached: false,
    keyed: false,
  };
}

/** Pre-aggregate per-endpoint statistics from raw requests. */
export function computeEndpointStats(requests: RequestEntry[]): Map<string, EndpointStats> {
  const map = new Map<string, EndpointStats>();

  for (const r of requests) {
    const key = buildKey(r);
    let s = map.get(key);
    if (!s) {
      s = createEmptyStats(r, key);
      map.set(key, s);
    }

    s.count++;
    s.requestIds.push(r.id);
    s.modes.add(r.mode);
    if (r.httpMethod) s.httpMethods.add(r.httpMethod.toUpperCase());
    if (r.hasValidation.variables) s.hasVariablesValidation = true;
    if (r.hasValidation.response) s.hasResponseValidation = true;
    if (carriesVariables(r.variables)) s.sentVariables = true;
    if (r.size != null) s.sizes.push(r.size);
    if (r.statusCode != null) s.statusCodes.push(r.statusCode);
    if (r.cache) s.cached = true;
    if (r.idempotencyKey !== undefined) s.keyed = true;
  }

  for (const [key, s] of map) {
    const reqs = requests.filter((r) => buildKey(r) === key);
    computeDurations(s, reqs);
    computeOverheads(s, reqs);
  }

  return map;
}

/* The API's time is the requests': a read another call's request answered only waited for it. */
function computeDurations(s: EndpointStats, reqs: RequestEntry[]): void {
  const durations = reqs
    .filter((r) => r.shared === undefined)
    .map((r) => r.timing?.total ?? 0)
    .filter((d) => d > 0)
    .sort((a, b) => a - b);

  const errors = reqs.filter((r) => r.status === "error" || r.status === "validation_error").length;

  s.avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  s.p95 = percentile(durations, 95);
  s.errorRate = s.count > 0 ? errors / s.count : 0;
  s.avgSize = s.sizes.length > 0 ? s.sizes.reduce((a, b) => a + b, 0) / s.sizes.length : 0;
}

function computeOverheads(s: EndpointStats, reqs: RequestEntry[]): void {
  let mwSum = 0;
  let valSum = 0;
  let proxySum = 0;
  let mwCount = 0;
  let valCount = 0;
  let proxyCount = 0;

  for (const r of reqs) {
    const total = r.timing?.total;
    if (!total || total <= 0 || r.shared !== undefined) continue;

    if (r.timing?.middleware != null) {
      mwSum += r.timing.middleware / total;
      mwCount++;
    }
    if (r.timing?.validation != null) {
      valSum += r.timing.validation / total;
      valCount++;
    }
    if (r.proxyTiming) {
      /* The browser measures the trips to and from the proxy; they lie outside the server's total. */
      const legs = (r.proxyTiming.clientToProxy ?? 0) + (r.proxyTiming.proxyToClient ?? 0);
      proxySum += legs / (legs + total);
      proxyCount++;
    }
  }

  s.middlewareOverhead = mwCount > 0 ? mwSum / mwCount : 0;
  s.validationOverhead = valCount > 0 ? valSum / valCount : 0;
  s.proxyOverhead = proxyCount > 0 ? proxySum / proxyCount : 0;
}

/* A call that took no variables sent nothing a schema could have checked. */
function carriesVariables(variables: unknown): boolean {
  if (variables === undefined || variables === null) return false;
  if (typeof variables !== "object") return true;
  return Array.isArray(variables) ? variables.length > 0 : Object.keys(variables).length > 0;
}
