import { TrendingUp, TrendingDown } from "lucide-react";
import { Line, LineChart } from "recharts";

import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/shared/animated-counter";

import type { TrendInfo, SparklinePoint } from "./types";

// ── Props ────────────────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: number;
  format: (n: number) => string;
  color?: string;
  trend?: TrendInfo;
  /** When true, "up" trend is bad (e.g. latency, errors) */
  invertTrend?: boolean;
  sparkline?: SparklinePoint[];
  sparklineColor?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function KPICard({
  label,
  value,
  format,
  color = "text-foreground",
  trend,
  invertTrend = false,
  sparkline,
  sparklineColor = "var(--chart-1)",
}: KPICardProps): React.ReactElement {
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={sparklineColor} />
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <AnimatedCounter value={value} format={format} className={cn("text-h1", color)} />
        {trend && trend.direction !== "flat" && (
          <TrendBadge trend={trend} invert={invertTrend} />
        )}
      </div>
    </div>
  );
}

// ── Trend Badge ──────────────────────────────────────────────────────────────

function TrendBadge({ trend, invert }: {
  trend: TrendInfo;
  invert: boolean;
}): React.ReactElement {
  const isUp = trend.direction === "up";
  const isBad = invert ? isUp : !isUp;
  const color = isBad ? "text-rose-400" : "text-emerald-400";
  const Icon = isUp ? TrendingUp : TrendingDown;

  return (
    <span className={cn("flex items-center gap-0.5 text-body-xs", color)}>
      <Icon className="size-3" />
      <span className="tabular-nums">{formatTrendPercent(trend.percent)}</span>
    </span>
  );
}

function formatTrendPercent(percent: number): string {
  const capped = Math.min(percent, 999.9);
  return `${capped.toFixed(1)}%`;
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ data, color }: {
  data: SparklinePoint[];
  color: string;
}): React.ReactElement {
  return (
    <LineChart width={48} height={20} data={data} accessibilityLayer={false}>
      <Line
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}
