import type { RequestEntry } from "@/store/types-request";
import type { Delta } from "./delta";
import { deltaOf } from "./delta";

/** A phase of the two calls' time, side by side. */
export interface TimingRow {
  label: string;
  /** The colour it is drawn in: a text class. */
  tone: string;
  a: number;
  b: number;
  delta: Delta;
}

type Phase = readonly [label: string, tone: string, read: (r: RequestEntry) => number | undefined];

const PHASES: readonly Phase[] = [
  ["Total", "text-fg-muted", (r) => r.timing?.total],
  ["Fetch", "text-brand", (r) => r.timing?.fetch],
  ["Middleware", "text-syntax-keyword", (r) => r.timing?.middleware],
  ["Validation", "text-syntax-number", (r) => r.timing?.validation],
];

/* The trips a proxied call makes, which the browser and the proxy measure. */
const PROXY_PHASES: readonly Phase[] = [
  ["Client → proxy", "text-syntax-type", (r) => r.proxyTiming?.clientToProxy],
  ["Proxy → upstream", "text-syntax-type", (r) => r.proxyTiming?.proxyToBackend],
  ["Upstream → proxy", "text-syntax-type", (r) => r.proxyTiming?.backendToProxy],
  ["Proxy → client", "text-syntax-type", (r) => r.proxyTiming?.proxyToClient],
];

/**
 * The two calls' time phase by phase — the whole call, the fetch,
 * middleware and validation, and, when either went through the proxy, its
 * trips — each with how it moved from A to B.
 *
 * @param a - The left call
 * @param b - The right call
 * @returns The phases, in order
 * @example
 * ```ts
 * timingRows(a, b)[0]; // { label: "Total", a: 236, b: 1830, delta: { label: "+675%", … } }
 * ```
 */
export function timingRows(a: RequestEntry, b: RequestEntry): TimingRow[] {
  const proxied = a.proxyTiming !== undefined || b.proxyTiming !== undefined;
  return [...PHASES, ...(proxied ? PROXY_PHASES : [])].map(([label, tone, read]) => {
    const ta = read(a) ?? 0;
    const tb = read(b) ?? 0;
    return { label, tone, a: ta, b: tb, delta: deltaOf(ta, tb) };
  });
}
