import { Activity, AlertTriangle, Clock, Layers } from "lucide-react";
import { Line, LineChart } from "recharts";

import { AnimatedCounter } from "@/components/shared/animated-counter";
import { formatDuration } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";

import type { AggregateMiddleware, SparklinePoint } from "./types";

// ── Props ──────────────────────────────────────────────────────────────────

interface AggregateCardsProps {
  stats: AggregateMiddleware[];
  overheadPercent: number;
  execSparkline: SparklinePoint[];
  overheadSparkline: SparklinePoint[];
  p95Sparkline: SparklinePoint[];
}

// ── Component ──────────────────────────────────────────────────────────────

export function AggregateCards({
  stats,
  overheadPercent,
  execSparkline,
  overheadSparkline,
  p95Sparkline,
}: AggregateCardsProps): React.ReactElement {
  const uniqueCount = stats.length;
  const totalCalls = stats.reduce((s, m) => s + m.calls, 0);
  const totalErrors = stats.reduce((s, m) => s + m.errors, 0);
  const avgDuration =
    stats.length > 0 ? stats.reduce((s, m) => s + m.avgDuration, 0) / stats.length : 0;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card icon={Layers} label="Active Middleware" value={uniqueCount} format={fmtInt} />
      <Card
        icon={Activity}
        label="Total Executions"
        value={totalCalls}
        format={fmtInt}
        sparkline={execSparkline}
        sparkColor="var(--chart-4)"
      />
      <Card
        icon={Clock}
        label="Avg Self-Time"
        display={formatDuration(avgDuration)}
        sparkline={p95Sparkline}
        sparkColor="var(--chart-1)"
      />
      <Card
        icon={AlertTriangle}
        label="Avg Overhead"
        display={fmtPercent(overheadPercent)}
        color={totalErrors > 0 ? "text-rose-400" : undefined}
        sparkline={overheadSparkline}
        sparkColor="var(--chart-3)"
      />
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────

function Card({
  icon: Icon,
  label,
  value,
  display,
  format,
  color,
  sparkline,
  sparkColor,
}: {
  icon: React.ElementType;
  label: string;
  value?: number;
  display?: string;
  format?: (n: number) => string;
  color?: string | undefined;
  sparkline?: SparklinePoint[];
  sparkColor?: string;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-3.5 text-muted-foreground/60" />
          <span className="text-caption text-muted-foreground/70">{label}</span>
        </div>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} color={sparkColor ?? "var(--chart-1)"} />
        )}
      </div>
      <div className="mt-2">
        {value != null && format ? (
          <AnimatedCounter value={value} format={format} className={cn("text-h1", color)} />
        ) : (
          <span className={cn("text-h1 tabular-nums", color)}>{display}</span>
        )}
      </div>
    </div>
  );
}

// ── Sparkline ──────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: SparklinePoint[]; color: string }): React.ReactElement {
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

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}
