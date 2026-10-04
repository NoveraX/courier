import type { ChartConfig } from "@/components/ui/chart";

// ── Thresholds ───────────────────────────────────────────────────────────────

export const SUCCESS_RATE_GOOD = 95;
export const SUCCESS_RATE_WARN = 80;
export const RESPONSE_TIME_GOOD_MS = 200;
export const RESPONSE_TIME_WARN_MS = 500;
export const ERROR_RATE_WARN = 10;
export const MAX_ENDPOINTS_SHOWN = 15;

// ── Duration color helper ────────────────────────────────────────────────────

export function durationColor(ms: number): string {
  if (ms < RESPONSE_TIME_GOOD_MS) return "text-emerald-400";
  if (ms < RESPONSE_TIME_WARN_MS) return "text-amber-400";
  return "text-rose-400";
}

export function errorRateColor(rate: number): string {
  if (rate === 0) return "text-emerald-400";
  if (rate <= ERROR_RATE_WARN) return "text-amber-400";
  return "text-rose-400";
}

export function successRateColor(rate: number): string {
  if (rate >= SUCCESS_RATE_GOOD) return "text-emerald-400";
  if (rate >= SUCCESS_RATE_WARN) return "text-amber-400";
  return "text-rose-400";
}

// ── Chart Configs ────────────────────────────────────────────────────────────

export const HISTOGRAM_CHART_CONFIG: ChartConfig = {
  success: { label: "Success", color: "var(--chart-2)" },
  error: { label: "Error", color: "var(--chart-7)" },
};

export const STATUS_CHART_CONFIG: ChartConfig = {
  "2xx": { label: "2xx Success", color: "var(--chart-2)" },
  "3xx": { label: "3xx Redirect", color: "var(--chart-5)" },
  "4xx": { label: "4xx Client", color: "var(--chart-3)" },
  "5xx": { label: "5xx Server", color: "var(--chart-7)" },
  Error: { label: "Error", color: "var(--destructive-foreground)" },
  Other: { label: "Other", color: "var(--muted-foreground)" },
};

export const TIME_SERIES_CHART_CONFIG: ChartConfig = {
  success: { label: "Success", color: "var(--chart-2)" },
  error: { label: "Error", color: "var(--chart-7)" },
  pending: { label: "Pending", color: "var(--chart-5)" },
};
