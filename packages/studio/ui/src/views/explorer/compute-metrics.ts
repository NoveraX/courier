import type { RequestEntry } from "@/store/types";
import {
  ACTIVE_THRESHOLD_MS,
  RESPONSE_TIME_WARN_MS,
  SUCCESS_RATE_GOOD,
  SUCCESS_RATE_WARN,
} from "./constants";
import type { HealthLevel, NodeMetrics } from "./types";

// ── Metrics computation ─────────────────────────────────────────────────────

/** Computes aggregated metrics from a filtered set of requests */
export function computeNodeMetrics(requests: RequestEntry[]): NodeMetrics {
  const completed = requests.filter((r) => r.status !== "pending");
  const streaming = requests.some((r) => r.streamStatus === "streaming");

  if (completed.length === 0 && !streaming) return emptyMetrics();

  const successes = completed.filter((r) => r.status === "success").length;
  const errors = completed.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  ).length;

  const durations = completed.flatMap((r) => (r.timing ? [r.timing.total] : []));

  const sizes = completed.map((r) => r.size ?? 0);
  const lastRequest = completed[completed.length - 1];

  return {
    totalRequests: completed.length,
    successRate: completed.length > 0 ? (successes / completed.length) * 100 : 100,
    avgResponseTime: avg(durations),
    p95ResponseTime: percentile(durations, 95),
    errorCount: errors,
    avgSize: avg(sizes),
    lastRequestAt: lastRequest?.startedAt ?? null,
    isActive: streaming || isRecentlyActive(lastRequest?.startedAt ?? null),
  };
}

// ── Health level ────────────────────────────────────────────────────────────

export function getHealthLevel(metrics: NodeMetrics): HealthLevel {
  if (metrics.totalRequests === 0) return "inactive";
  if (metrics.successRate >= SUCCESS_RATE_GOOD && metrics.p95ResponseTime < RESPONSE_TIME_WARN_MS) {
    return "healthy";
  }
  if (metrics.successRate >= SUCCESS_RATE_WARN) return "degraded";
  return "critical";
}

// ── Utilities ───────────────────────────────────────────────────────────────

function emptyMetrics(): NodeMetrics {
  return {
    totalRequests: 0,
    successRate: 100,
    avgResponseTime: 0,
    p95ResponseTime: 0,
    errorCount: 0,
    avgSize: 0,
    lastRequestAt: null,
    isActive: false,
  };
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const copy = [...sorted].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * copy.length) - 1;
  return copy[Math.max(0, idx)] ?? 0;
}

function isRecentlyActive(timestamp: number | null): boolean {
  if (timestamp === null) return false;
  return Date.now() - timestamp < ACTIVE_THRESHOLD_MS;
}
