import type { RequestEntry } from "@/store/types-request";
import { buildKey } from "./compute-stats";
import { callOf, labelOf } from "./hints-utils";
import type { AuditItem } from "./types";

const N1_WINDOW_MS = 3000;
const READ_METHODS = new Set(["GET", "HEAD", "QUERY"]);
const WATERFALL_MIN_CHAIN = 3;
const WATERFALL_MIN_TOTAL_MS = 2000;

/** Detect N+1: list call followed by N detail calls within a time window. */
/** Requests passed here are already filtered to completed in run-audit.ts */
export function detectNPlusOne(requests: RequestEntry[]): AuditItem[] {
  /* Oldest first: the store holds requests newest first, which would put
     every follower before its list call, so none would be found, and the
     window's early exit would never fire. */
  /* Patterns of requests on the wire: a read another call's request answered sent none. */
  const completed = requests
    .filter((r) => r.timing?.total && r.shared === undefined)
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
      description: `List call to "${labelOf(listReq)}" followed by ${matching.length} sequential detail calls to "${labelOf(firstMatch)}".`,
      suggestion: "Fetch all needed data in one request, or use batching.",
      codeSuggestion: `// Consider batching:\nconst items = await ${callOf(listReq)};\n// Instead of N calls, fetch all at once`,
      requestIds: allIds,
    });
  }

  return items;
}

/* A call that reads: not a mutation, and sent with a method that only reads. */
function isReadCall(r: RequestEntry): boolean {
  return r.type !== "mutation" && READ_METHODS.has((r.httpMethod ?? "GET").toUpperCase());
}

/* The reads of the list's source, other than the list itself, that start after it ends, within the window. */
function followersOf(completed: RequestEntry[], from: number, list: RequestEntry): RequestEntry[] {
  const listEnd = list.startedAt + (list.timing?.total ?? 0);
  const listKey = buildKey(list);
  const followers: RequestEntry[] = [];
  for (let j = from; j < completed.length; j++) {
    const r = completed[j];
    if (r === undefined || r.startedAt - listEnd > N1_WINDOW_MS) break;
    if (r.source !== list.source || r.startedAt < listEnd) continue;
    if (buildKey(r) !== listKey && isReadCall(r)) followers.push(r);
  }
  return followers;
}

/** Detect sequential waterfall: 3+ requests that run strictly in series. */
export function detectWaterfall(requests: RequestEntry[]): AuditItem[] {
  const completed = requests
    .filter((r) => r.timing?.total && r.shared === undefined)
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
