import { formatDuration, formatNumber, formatSize } from "@/components/shared/formatters";
import { MethodBadge } from "@/components/shared/method-badge";
import { cn } from "@/lib/utils";

import type { TopEndpointEntry, TopMetric } from "./compute-overview";

// ── Metric toggle config ────────────────────────────────────────────────────

interface MetricOption {
  key: TopMetric;
  label: string;
  format: (n: number) => string;
}

const METRIC_OPTIONS: MetricOption[] = [
  { key: "latency", label: "Slowest", format: formatDuration },
  { key: "errors", label: "Most Errors", format: fmtInt },
  { key: "traffic", label: "Most Traffic", format: formatNumber },
  { key: "size", label: "Largest", format: formatSize },
];

// ── Component ───────────────────────────────────────────────────────────────

interface TopEndpointsProps {
  endpoints: TopEndpointEntry[];
  metric: TopMetric;
  onMetricChange: (metric: TopMetric) => void;
  onSelectEndpoint?: (source: string, group: string, method: string) => void;
}

export function TopEndpoints({
  endpoints,
  metric,
  onMetricChange,
  onSelectEndpoint,
}: TopEndpointsProps): React.ReactElement {
  const activeOption = METRIC_OPTIONS.find((o) => o.key === metric)!;

  return (
    <div className="space-y-3">
      {/* Metric toggle */}
      <div className="flex gap-4 border-b border-border-subtle/50 pb-1.5">
        {METRIC_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onMetricChange(opt.key)}
            className={cn(
              "relative pb-1 text-[14px] transition-colors",
              opt.key === metric
                ? "text-foreground font-medium"
                : "text-muted-foreground/40 hover:text-muted-foreground/70",
            )}
          >
            {opt.label}
            {opt.key === metric && (
              <span className="absolute inset-x-0 -bottom-1.75 h-px bg-accent-brand" />
            )}
          </button>
        ))}
      </div>

      {/* Endpoint list */}
      {endpoints.length === 0 ? (
        <div className="flex h-20 items-center justify-center text-body-xs text-muted-foreground/60">
          No endpoint data yet
        </div>
      ) : (
        <div className="space-y-0.5">
          {endpoints.map((ep, i) => (
            <EndpointRow
              key={`${ep.source}.${ep.group}.${ep.method}`}
              rank={i + 1}
              entry={ep}
              format={activeOption.format}
              maxValue={endpoints[0].value}
              onSelect={onSelectEndpoint ? () => onSelectEndpoint(ep.source, ep.group, ep.method) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

function EndpointRow({
  rank,
  entry,
  format,
  maxValue,
  onSelect,
}: {
  rank: number;
  entry: TopEndpointEntry;
  format: (n: number) => string;
  maxValue: number;
  onSelect?: () => void;
}): React.ReactElement {
  const barWidth = maxValue > 0 ? (entry.value / maxValue) * 100 : 0;

  return (
    <div
      role={onSelect ? "button" : undefined}
      onClick={onSelect}
      className="group relative flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/30 cursor-pointer"
    >
      {/* Bar background */}
      <div
        className="absolute inset-y-0 left-0 rounded-lg bg-accent-brand/5 transition-all"
        style={{ width: `${barWidth}%` }}
      />

      {/* Content */}
      <span className="relative z-10 w-5 text-right text-caption tabular-nums text-muted-foreground/50">
        {rank}
      </span>
      <span className={cn("size-2 shrink-0 rounded-full", successRateColor(entry.successRate))} />
      <MethodBadge method={entry.httpMethod} className="text-[9px]" />
      <span className="relative z-10 flex-1 truncate text-body-xs font-medium text-foreground/90">
        {entry.group ? (
          <span className="text-muted-foreground/50">{entry.group}.</span>
        ) : null}
        {entry.method}
      </span>
      <span className="relative z-10 text-body-xs tabular-nums text-muted-foreground">
        {format(entry.value)}
      </span>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function successRateColor(rate: number): string {
  if (rate >= 95) return "bg-emerald-400";
  if (rate >= 80) return "bg-amber-400";
  return "bg-rose-400";
}
