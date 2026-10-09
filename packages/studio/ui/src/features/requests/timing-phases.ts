import { formatDuration } from "@/lib/formatters";
import type { RequestEntry } from "@/store/types";
import { type DeliveryStop, deliveryStopOf } from "./webhook-delivery";

/** A phase of a request's time, placed from its start. */
export interface TimingPhase {
  key:
    | "middleware-in"
    | "middleware"
    | "fetch"
    | "validation"
    | "middleware-out"
    | "overhead"
    | "checks"
    | "handler";
  label: string;
  /** When it began, in ms from the request's start. */
  start: number;
  duration: number;
}

/* Time Courier spends between the phases it measures is left out below a millisecond. */
const OVERHEAD_SHOWN_FROM = 1;

const sum = (values: readonly (number | undefined)[]): number =>
  values.reduce<number>((total, v) => total + (v ?? 0), 0);

/**
 * How a request spent its time, phase after phase in the order Courier runs
 * them: the middleware before the call, the fetch, the validation, the
 * middleware after — or the middleware as one phase when its steps do not
 * say how they split — and what Courier itself took between them. A
 * webhook delivered to the app spends it on its checks, then its handler.
 *
 * @param r - The request
 * @returns The total and the phases, or `null` before the request has timings
 * @example
 * ```ts
 * timingPhasesOf(request)?.phases.map((p) => p.label); // ["Middleware in", "Fetch", "Validation", "Middleware out"]
 * ```
 */
export function timingPhasesOf(
  r: Pick<
    RequestEntry,
    "timing" | "middlewareEntries" | "mode" | "error" | "statusCode" | "variables"
  >,
): { total: number; phases: TimingPhase[] } | null {
  if (!r.timing) return null;
  if (r.mode === "webhook") return deliveryPhases(r.timing, deliveryStopOf(r));
  const { total, middleware, fetch, validation } = r.timing;
  const before = sum(r.middlewareEntries.map((e) => e.beforeDuration));
  const after = sum(r.middlewareEntries.map((e) => e.afterDuration));
  const split = before + after > 0;
  const parts: Omit<TimingPhase, "start">[] = split
    ? [
        { key: "middleware-in", label: "Middleware in", duration: before },
        { key: "fetch", label: "Fetch", duration: fetch },
        { key: "validation", label: "Validation", duration: validation },
        { key: "middleware-out", label: "Middleware out", duration: after },
      ]
    : [
        { key: "middleware", label: "Middleware", duration: middleware },
        { key: "fetch", label: "Fetch", duration: fetch },
        { key: "validation", label: "Validation", duration: validation },
      ];
  const measured = sum(parts.map((p) => p.duration));
  const overhead = total - measured;
  if (overhead >= OVERHEAD_SHOWN_FROM)
    parts.push({ key: "overhead", label: "Overhead", duration: overhead });
  let start = 0;
  const phases = parts
    .filter((p) => p.key === "fetch" || p.duration > 0)
    .map((p) => {
      const phase = { ...p, start };
      start += p.duration;
      return phase;
    });
  return { total, phases };
}

/* A delivery made to the app spends its time on its checks — read, signature, body — then in its handler. */
function deliveryPhases(
  timing: NonNullable<RequestEntry["timing"]>,
  stop: DeliveryStop | undefined,
): { total: number; phases: TimingPhase[] } {
  const { total } = timing;
  const checks = Math.min(timing.validation, total);
  const reachedHandler = stop === undefined || stop === "handler";
  const phases: TimingPhase[] = reachedHandler
    ? [
        { key: "checks", label: "Checks", start: 0, duration: checks },
        { key: "handler", label: "Handler", start: checks, duration: total - checks },
      ]
    : [{ key: "checks", label: "Checks", start: 0, duration: total }];
  return { total, phases };
}

/**
 * The marks under a timing scale: its start, its quarters and its end.
 *
 * @param total - The span, in ms
 * @returns Five labels
 * @example
 * ```ts
 * timeTicks(200); // ["0ms", "50ms", "100ms", "150ms", "200ms"]
 * ```
 */
export function timeTicks(total: number): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => (f === 0 ? "0ms" : formatDuration(total * f)));
}

/** How a call's duration compares with its endpoint's p95. */
export interface P95Comparison {
  label: string;
  trend: "slower" | "faster" | "in-line";
  detail: string;
}

/**
 * Compare a call with its endpoint's p95: in line within 15% of it.
 *
 * @param ms - The call's duration
 * @param latency - The endpoint's p95 and how many calls it rests on
 * @param endpoint - The endpoint's name
 * @returns The comparison
 * @example
 * ```ts
 * compareToP95(300, { p95: 100, count: 12 }, "orders.create").label; // "3.0× slower than p95"
 * ```
 */
export function compareToP95(
  ms: number,
  latency: { p95: number; count: number },
  endpoint: string,
): P95Comparison {
  const ratio = latency.p95 > 0 ? ms / latency.p95 : 1;
  const calls = `${latency.count} ${latency.count === 1 ? "call" : "calls"}`;
  const detail = `${endpoint} p95 ${formatDuration(latency.p95)} · ${calls}`;
  if (ratio > 1.15)
    return { label: `${ratio.toFixed(1)}× slower than p95`, trend: "slower", detail };
  if (ratio < 0.85) {
    return { label: `${(1 / ratio).toFixed(1)}× faster than p95`, trend: "faster", detail };
  }
  return { label: "In line with p95", trend: "in-line", detail };
}
