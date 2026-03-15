import type { RequestStatus } from "@/store/types";

// ── KPI ──────────────────────────────────────────────────────────────────────

export interface TrendInfo {
  direction: "up" | "down" | "flat";
  percent: number;
}

export interface SparklinePoint {
  value: number;
}

export interface KPIData {
  totalRequests: number;
  successRate: number;
  p95ResponseTime: number;
  errorCount: number;
  throughput: number;
  avgSize: number;
  successRateTrend: TrendInfo;
  p95Trend: TrendInfo;
  errorTrend: TrendInfo;
  totalRequestsSparkline: SparklinePoint[];
  successRateSparkline: SparklinePoint[];
  p95Sparkline: SparklinePoint[];
  errorSparkline: SparklinePoint[];
  throughputSparkline: SparklinePoint[];
  avgSizeSparkline: SparklinePoint[];
}

// ── Histogram ────────────────────────────────────────────────────────────────

export interface HistogramBucket {
  label: string;
  range: string;
  success: number;
  error: number;
}

// ── Status Breakdown ─────────────────────────────────────────────────────────

export interface StatusSlice {
  name: string;
  value: number;
  fill: string;
}

// ── Time Series ──────────────────────────────────────────────────────────────

export interface TimeSeriesBucket {
  label: string;
  success: number;
  error: number;
  pending: number;
}

// ── Endpoint Stats ───────────────────────────────────────────────────────────

export interface EndpointStat {
  endpoint: string;
  calls: number;
  avgResponseTime: number;
  p50: number;
  p95: number;
  p99: number;
  avgSize: number;
  errorRate: number;
  lastStatus: RequestStatus;
  requestIds: string[];
}

export type EndpointSortKey =
  | "endpoint"
  | "calls"
  | "avgResponseTime"
  | "p50"
  | "p95"
  | "p99"
  | "avgSize"
  | "errorRate";

export type SortDir = "asc" | "desc";
