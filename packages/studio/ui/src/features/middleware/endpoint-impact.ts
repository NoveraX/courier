import { endpointKeyOf } from "@/features/explorer/endpoint-key";
import { endpointParts, httpMethodOf } from "@/features/requests/request-parts";
import type { RequestEntry } from "@/store/types-request";

/** One endpoint's middleware cost. */
export interface EndpointImpact {
  key: string;
  prefix: string;
  name: string;
  httpMethod: string;
  calls: number;
  /** Middleware time in one of its calls, on average, ms. */
  perCall: number;
  /** The share of its calls' time spent in middleware, 0–100. */
  share: number;
  /** Each middleware's time in one of its calls, on average, in the order they run. */
  parts: { name: string; ms: number }[];
  /** Its newest call, whose chain the row opens. */
  newestId: string;
}

/* How many endpoints the table ranks. */
const RANKED = 10;

function impactOf(key: string, calls: readonly RequestEntry[]): EndpointImpact | null {
  const [newest] = calls;
  if (!newest) return null;
  const byName = new Map<string, number>();
  for (const r of calls) {
    for (const entry of [...r.middlewareEntries].sort((a, b) => a.index - b.index)) {
      byName.set(entry.name, (byName.get(entry.name) ?? 0) + (entry.duration ?? 0));
    }
  }
  const mw = calls.reduce((sum, r) => sum + (r.timing?.middleware ?? 0), 0);
  const all = calls.reduce((sum, r) => sum + (r.timing?.total ?? 0), 0);
  return {
    key,
    ...endpointParts(newest),
    httpMethod: httpMethodOf(newest),
    calls: calls.length,
    perCall: mw / calls.length,
    share: all > 0 ? (mw / all) * 100 : 0,
    parts: [...byName].map(([name, ms]) => ({ name, ms: ms / calls.length })),
    newestId: newest.id,
  };
}

/**
 * The endpoints whose calls spend the most time in middleware: each with
 * its middleware time in a call, the share of its calls' time that is, and
 * what each middleware takes.
 *
 * @param calls - The calls that ran through middleware, newest first
 * @returns The ten costliest endpoints, costliest first
 * @example
 * ```ts
 * endpointImpact(traced(requests))[0]; // { key: "api.users.get", perCall: 3.2, share: 16, … }
 * ```
 */
export function endpointImpact(calls: readonly RequestEntry[]): EndpointImpact[] {
  const byKey = new Map<string, RequestEntry[]>();
  for (const r of calls) {
    const key = endpointKeyOf(r);
    const list = byKey.get(key);
    if (list) list.push(r);
    else byKey.set(key, [r]);
  }
  return [...byKey]
    .flatMap(([key, list]) => {
      const impact = impactOf(key, list);
      return impact ? [impact] : [];
    })
    .sort((a, b) => b.perCall - a.perCall)
    .slice(0, RANKED);
}
