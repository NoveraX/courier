import type { RequestEntry } from "../../store/types-request";
import type { AuditItem } from "./types";

const SLOW_MW_THRESHOLD_MS = 50;

/** Individual middleware that takes >50ms. */
function slowMiddleware(requests: RequestEntry[]): AuditItem[] {
  const slow = new Map<string, { total: number; count: number; ids: string[] }>();

  for (const r of requests) {
    for (const mw of r.middlewareEntries) {
      if (mw.duration != null && mw.duration > SLOW_MW_THRESHOLD_MS) {
        const entry = slow.get(mw.name) ?? { total: 0, count: 0, ids: [] };
        entry.total += mw.duration;
        entry.count++;
        entry.ids.push(r.id);
        slow.set(mw.name, entry);
      }
    }
  }

  if (slow.size === 0) return [];

  return [{
    id: "deep-slow-middleware",
    severity: "warning",
    category: "performance",
    title: "Slow middleware detected",
    description: "Individual middleware execution exceeds 50ms.",
    suggestion: "Optimize or cache the slow middleware, or move heavy logic to the endpoint.",
    endpoints: [...slow].map(([name, { total, count, ids }]) => ({
      key: name,
      label: name,
      detail: `avg ${(total / count).toFixed(0)}ms (${count}x)`,
      requestIds: ids.slice(0, 5),
    })),
  }];
}

/** Response is an empty array — possible wrong params or stale endpoint. */
function emptyArrayResponse(requests: RequestEntry[]): AuditItem[] {
  const grouped = new Map<string, string[]>();
  for (const r of requests) {
    if (r.status !== "success" || !Array.isArray(r.data) || r.data.length > 0) continue;
    const label = r.group
      ? `${r.source}.${r.group}.${r.method}`
      : `${r.source}.${r.method}`;
    const ids = grouped.get(label) ?? [];
    ids.push(r.id);
    grouped.set(label, ids);
  }
  if (grouped.size === 0) return [];

  return [{
    id: "deep-empty-response",
    severity: "hint",
    category: "performance",
    title: "Empty array responses",
    description: "Endpoints returning empty arrays — check if parameters are correct.",
    suggestion: "Verify request variables or consider caching empty results.",
    endpoints: [...grouped].map(([label, ids]) => ({
      key: label,
      label,
      detail: `${ids.length}x empty`,
      requestIds: ids.slice(0, 3),
    })),
  }];
}

/** Request payload > 100KB. */
function largeRequestPayload(requests: RequestEntry[]): AuditItem[] {
  const large: { r: RequestEntry; size: number }[] = [];
  for (const r of requests) {
    if (!r.sentBody) continue;
    const size = estimateSize(r.sentBody);
    if (size > 102_400) large.push({ r, size });
  }
  if (large.length === 0) return [];

  return [{
    id: "deep-large-request",
    severity: "warning",
    category: "performance",
    title: "Large request payloads",
    description: "Request body exceeds 100KB — consider pagination or chunking.",
    suggestion: "Split large payloads into smaller requests or use streaming.",
    endpoints: large.map(({ r, size }) => ({
      key: r.id,
      label: r.group ? `${r.source}.${r.group}.${r.method}` : `${r.source}.${r.method}`,
      detail: `${(size / 1024).toFixed(0)}KB sent`,
      requestIds: [r.id],
    })),
  }];
}

/** Response > 1KB without Content-Encoding (no compression). */
function noCompression(requests: RequestEntry[]): AuditItem[] {
  const uncompressed = requests.filter((r) =>
    r.headers && r.size && r.size > 1024 && !r.headers["content-encoding"],
  );
  if (uncompressed.length === 0) return [];

  return [{
    id: "deep-no-compression",
    severity: "hint",
    category: "performance",
    title: "No response compression",
    description: "Responses over 1KB lack Content-Encoding (gzip/br). Wasted bandwidth.",
    suggestion: "Enable gzip or Brotli compression on the backend server.",
  }];
}

function estimateSize(value: unknown): number {
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/** Collect deep performance rules from raw requests. */
export function collectDeepPerformance(requests: RequestEntry[]): AuditItem[] {
  return [
    ...slowMiddleware(requests),
    ...emptyArrayResponse(requests),
    ...largeRequestPayload(requests),
    ...noCompression(requests),
  ];
}
