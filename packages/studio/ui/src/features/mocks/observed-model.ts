import type { MockRequestLog } from "@/store/mock-slice";
import { injectedFault, mockLogCode, mockLogTone } from "./mock-log";

/* The latest answers the Observed card reads. */
const RECENT = 60;

const EDGES = [0, 50, 100, 200, 400, 700, 1_000, 2_000, 4_000, Number.POSITIVE_INFINITY];
const EDGE_LABELS = ["50", "100", "200", "400", "700", "1s", "2s", "4s", "4s+"];

/** One range of the latency histogram. */
export interface LatencyBin {
  label: string;
  count: number;
  /** Its count against the fullest range's, 0–1. */
  share: number;
  tone: "brand" | "warn" | "err";
}

/**
 * How the latest answers' durations spread over fixed ranges, each toned
 * against the slow threshold.
 *
 * @param logs - The server's logged requests, newest first
 * @param slowMs - Studio's slow-request threshold
 * @returns One bin per range, fastest first
 * @example
 * ```ts
 * latencyHistogram(logs, 500)[0]; // { label: "50", count: 52, share: 1, tone: "brand" }
 * ```
 */
export function latencyHistogram(logs: readonly MockRequestLog[], slowMs: number): LatencyBin[] {
  const counts = EDGE_LABELS.map(() => 0);
  for (const log of logs.slice(0, RECENT)) {
    if (log.duration === undefined) continue;
    const ms = log.duration;
    const bin = EDGES.findIndex(
      (edge, i) => ms >= edge && ms < (EDGES[i + 1] ?? Number.POSITIVE_INFINITY),
    );
    counts[bin] = (counts[bin] ?? 0) + 1;
  }
  const top = Math.max(1, ...counts);
  return EDGE_LABELS.map((label, i) => {
    /* A range that reaches past the threshold holds slow answers. */
    const high = EDGES[i + 1] ?? Number.POSITIVE_INFINITY;
    const tone = high > slowMs * 2 ? "err" : high > slowMs ? "warn" : "brand";
    return { label, count: counts[i] ?? 0, share: (counts[i] ?? 0) / top, tone };
  });
}

/** A cell of the status strip: an answer's tone and what it was, or an empty slot. */
export interface StripCell {
  tone: "ok" | "warn" | "err" | "empty";
  tip: string;
  /** The request it stands for; an empty slot stands for none. */
  id?: string | undefined;
}

/**
 * The latest sixty answers as cells, oldest first, empty slots first while
 * fewer have come.
 *
 * @param logs - The server's logged requests, newest first
 * @returns Sixty cells
 * @example
 * ```ts
 * statusStrip(logs).at(-1); // { tone: "ok", tip: "200 · /users", id: "req-1" }
 * ```
 */
export function statusStrip(logs: readonly MockRequestLog[]): StripCell[] {
  const answered = logs.slice(0, RECENT).reverse();
  const empty: StripCell[] = Array.from({ length: RECENT - answered.length }, () => ({
    tone: "empty",
    tip: "",
  }));
  const cells = answered.map((log): StripCell => {
    const fault = injectedFault(log);
    const code = fault === "reset" || fault === "interrupt" ? fault : mockLogCode(log);
    return { tone: mockLogTone(log), tip: `${code} · ${log.path}`, id: log.id };
  });
  return [...empty, ...cells];
}

/** How many of the latest answers chaos failed in one way. */
export interface FaultCount {
  kind: string;
  count: number;
}

/**
 * How many of the latest answers chaos failed in each way: every fault in
 * the mix, in its order, then any other the latest answers met — one a
 * route fails with of its own, say.
 *
 * @param logs - The server's logged requests, newest first
 * @param mix - The faults in the mix
 * @returns The count per kind
 * @example
 * ```ts
 * faultsByType(logs, ["500", "503"]); // [{ kind: "500", count: 3 }, { kind: "503", count: 0 }, { kind: "413", count: 2 }]
 * ```
 */
export function faultsByType(
  logs: readonly MockRequestLog[],
  mix: readonly string[],
): FaultCount[] {
  const kinds = logs
    .slice(0, RECENT)
    .map(injectedFault)
    .filter((kind) => kind !== undefined);
  const shown = [...new Set([...mix, ...kinds])];
  return shown.map((kind) => ({ kind, count: kinds.filter((k) => k === kind).length }));
}
