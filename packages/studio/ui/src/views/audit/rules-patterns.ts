import type { RequestEntry } from "../../store/types-request";
import { buildKey } from "./compute-stats";
import { callOf } from "./hints-utils";
import type { AuditItem } from "./types";

function formatLabel(r: RequestEntry): string {
  return r.group ? `${r.source}.${r.group}.${r.method}` : `${r.source}.${r.method}`;
}

const N1_WINDOW_MS = 3000;
const DUPLICATE_WINDOW_MS = 2000;
const WATERFALL_MIN_CHAIN = 3;
const WATERFALL_MIN_TOTAL_MS = 2000;

/** Detect N+1: list call followed by N detail calls within a time window. */
/** Requests passed here are already filtered to completed in run-audit.ts */
export function detectNPlusOne(requests: RequestEntry[]): AuditItem[] {
  /* Oldest first: the store holds requests newest first, which would put
     every follower before its list call, so none would be found, and the
     window's early exit would never fire. */
  const completed = requests
    .filter((r) => r.timing?.total)
    .sort((a, b) => a.startedAt - b.startedAt);
  const items: AuditItem[] = [];
  const seen = new Set<string>();

  for (const [i, listReq] of completed.entries()) {
    if (!Array.isArray(listReq.data)) continue;
    if (listReq.data.length < 2) continue;

    const followers = followersOf(completed, i + 1, listReq);
    const [firstFollower] = followers;
    if (followers.length < 2 || firstFollower === undefined) continue;

    const detailKey = buildKey(firstFollower);
    const matching = followers.filter((r) => buildKey(r) === detailKey);
    const [firstMatch] = matching;
    if (matching.length < 2 || firstMatch === undefined) continue;

    const patternId = `${buildKey(listReq)}→${detailKey}`;
    if (seen.has(patternId)) continue;
    seen.add(patternId);

    const allIds = [listReq.id, ...matching.map((r) => r.id)];
    items.push({
      id: `err-n-plus-one-${patternId}`,
      severity: "error",
      category: "performance",
      title: "N+1 request pattern",
      description: `List call to "${formatLabel(listReq)}" followed by ${matching.length} sequential detail calls to "${formatLabel(firstMatch)}".`,
      suggestion: "Fetch all needed data in one request, or use batching.",
      codeSuggestion: `// Consider batching:\nconst items = await ${callOf(listReq)};\n// Instead of N calls, fetch all at once`,
      requestIds: allIds,
    });
  }

  return items;
}

/* The calls to the list's source that start after it ends, within the window. */
function followersOf(completed: RequestEntry[], from: number, list: RequestEntry): RequestEntry[] {
  const listEnd = list.startedAt + (list.timing?.total ?? 0);
  const followers: RequestEntry[] = [];
  for (let j = from; j < completed.length; j++) {
    const r = completed[j];
    if (r === undefined || r.startedAt - listEnd > N1_WINDOW_MS) break;
    if (r.source === list.source && r.startedAt >= listEnd) followers.push(r);
  }
  return followers;
}

/** Detect duplicate requests: same endpoint + same variables within a short window. */
export function detectDuplicates(requests: RequestEntry[]): AuditItem[] {
  const completed = requests;
  const groups = new Map<string, RequestEntry[]>();

  for (const r of completed) {
    const sig = `${buildKey(r)}:${stableStringify(r.variables)}`;
    const list = groups.get(sig) ?? [];
    list.push(r);
    groups.set(sig, list);
  }

  const items: AuditItem[] = [];

  for (const [sig, reqs] of groups) {
    if (reqs.length < 2) continue;

    const dupes = findTimeClusters(reqs, DUPLICATE_WINDOW_MS);
    if (dupes.length === 0) continue;

    const allIds = dupes.flatMap((c) => c.map((r) => r.id));
    const totalCount = dupes.reduce((s, c) => s + c.length, 0);
    const first = dupes[0]?.[0];
    if (first === undefined) continue;
    const fullName = formatLabel(first);
    items.push({
      id: `warn-duplicate-${sig}`,
      severity: "warning",
      category: "performance",
      title: "Duplicate requests",
      description: `"${fullName}" called ${totalCount}x with identical variables within ${DUPLICATE_WINDOW_MS}ms.`,
      suggestion: "Deduplicate with caching, useMemo, or request deduplication middleware.",
      requestIds: allIds,
    });
  }

  return items;
}

/** Detect sequential waterfall: 3+ requests that run strictly in series. */
export function detectWaterfall(requests: RequestEntry[]): AuditItem[] {
  const completed = requests
    .filter((r) => r.timing?.total)
    .sort((a, b) => a.startedAt - b.startedAt);

  const items: AuditItem[] = [];
  let chain: RequestEntry[] = [];

  for (const r of completed) {
    const prev = chain[chain.length - 1];
    if (!prev) {
      chain = [r];
      continue;
    }

    const prevEnd = prev.startedAt + (prev.timing?.total ?? 0);
    const gap = r.startedAt - prevEnd;

    // Sequential if next starts within 50ms of previous ending
    if (gap >= 0 && gap < 50 && buildKey(r) !== buildKey(prev)) {
      chain.push(r);
    } else {
      emitWaterfallItem(chain, items);
      chain = [r];
    }
  }
  emitWaterfallItem(chain, items);

  return items;
}

function emitWaterfallItem(chain: RequestEntry[], items: AuditItem[]): void {
  const [a, b] = chain;
  if (chain.length < WATERFALL_MIN_CHAIN || a === undefined || b === undefined) return;

  const totalMs = chain.reduce((s, r) => s + (r.timing?.total ?? 0), 0);
  if (totalMs < WATERFALL_MIN_TOTAL_MS) return;

  const names = chain.map((r) => r.method).join(" → ");
  items.push({
    id: `warn-waterfall-${a.id}`,
    severity: "warning",
    category: "performance",
    title: "Sequential waterfall",
    description: `${chain.length} requests run in series (${(totalMs / 1000).toFixed(1)}s total): ${names}.`,
    suggestion: "Use Promise.all() to parallelize independent requests.",
    codeSuggestion: `// Before (sequential):\nconst a = await ${callOf(a)};\nconst b = await ${callOf(b)};\n\n// After (parallel):\nconst [a, b] = await Promise.all([\n  ${callOf(a)},\n  ${callOf(b)},\n]);`,
    requestIds: chain.map((r) => r.id),
  });
}

function findTimeClusters(reqs: RequestEntry[], windowMs: number): RequestEntry[][] {
  const sorted = [...reqs].sort((a, b) => a.startedAt - b.startedAt);
  const clusters: RequestEntry[][] = [];
  let current: RequestEntry[] = [];

  for (const r of sorted) {
    const first = current[0];
    if (first === undefined || r.startedAt - first.startedAt <= windowMs) {
      current.push(r);
    } else {
      if (current.length >= 2) clusters.push(current);
      current = [r];
    }
  }
  if (current.length >= 2) clusters.push(current);

  return clusters;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return String(value);
  try {
    return JSON.stringify(value, Object.keys(value).sort());
  } catch {
    return String(value);
  }
}
