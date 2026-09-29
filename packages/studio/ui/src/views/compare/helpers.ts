import type { ProxyTiming, RequestTiming } from "@/store/types-events";
import type { RequestEntry } from "@/store/types-request";

import type { HeaderDiff, TimingComparison } from "./types";

// Re-export text diff for consumers
export { computeTextDiff } from "./text-diff";

// ── Serialization ───────────────────────────────────────────────────────────

export function serializeForDiff(data: unknown, indent: number = 2): string {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data;
  return JSON.stringify(data, null, indent);
}

// ── Header diff ─────────────────────────────────────────────────────────────

export function computeHeaderDiff(
  leftHeaders: Record<string, string> | undefined,
  rightHeaders: Record<string, string> | undefined,
): HeaderDiff[] {
  const left = leftHeaders ?? {};
  const right = rightHeaders ?? {};
  const allKeys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();

  return allKeys.map((key) => {
    const lv = left[key];
    const rv = right[key];

    if (lv !== undefined && rv === undefined) return { key, left: lv, status: "removed" as const };
    if (lv === undefined && rv !== undefined) return { key, right: rv, status: "added" as const };
    if (lv === rv) return { key, left: lv, right: rv, status: "equal" as const };
    return { key, left: lv, right: rv, status: "changed" as const };
  });
}

// ── Timing diff ─────────────────────────────────────────────────────────────

function diffPercent(left: number, right: number): number {
  if (left === 0) return right === 0 ? 0 : 100;
  return ((right - left) / left) * 100;
}

function buildTimingPhases(
  timing: RequestTiming | undefined,
  proxy: ProxyTiming | undefined,
): Record<string, number> {
  const phases: Record<string, number> = {};

  if (timing) {
    phases.Total = timing.total;
    phases.Middleware = timing.middleware;
    phases.Fetch = timing.fetch;
    phases.Validation = timing.validation;
  }

  if (proxy) {
    phases["Client \u2192 Proxy"] = proxy.clientToProxy;
    phases["Proxy \u2192 Backend"] = proxy.proxyToBackend;
    phases["Backend \u2192 Proxy"] = proxy.backendToProxy;
    phases["Proxy \u2192 Client"] = proxy.proxyToClient;
  }

  return phases;
}

export function computeTimingDiff(left: RequestEntry, right: RequestEntry): TimingComparison[] {
  const leftPhases = buildTimingPhases(left.timing, left.proxyTiming);
  const rightPhases = buildTimingPhases(right.timing, right.proxyTiming);
  const allPhases = [...new Set([...Object.keys(leftPhases), ...Object.keys(rightPhases)])];

  return allPhases.map((phase) => {
    const lMs = leftPhases[phase] ?? 0;
    const rMs = rightPhases[phase] ?? 0;
    return {
      phase,
      leftMs: lMs,
      rightMs: rMs,
      diffMs: rMs - lMs,
      diffPercent: diffPercent(lMs, rMs),
    };
  });
}

// ── Format helpers ──────────────────────────────────────────────────────────

export function formatDiffPercent(diff: number): string {
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${diff.toFixed(0)}%`;
}

export function getPayloadData(req: RequestEntry): unknown {
  return req.validatedVariables ?? req.variables;
}

export function getResponseData(req: RequestEntry): unknown {
  return req.validatedResponse ?? req.data;
}
