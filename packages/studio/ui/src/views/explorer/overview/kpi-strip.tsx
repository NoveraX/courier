import type { LucideIcon } from "lucide-react";
import { Activity, FolderTree, HeartPulse, Server, Zap } from "lucide-react";
import { Line, LineChart } from "recharts";
import { AnimatedCounter } from "@/components/shared/animated-counter";
import { formatNumber } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";
import type { OverviewKPI, SparklinePoint } from "./compute-overview";

// ── Config ──────────────────────────────────────────────────────────────────

interface KPIEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  format: (n: number) => string;
  color: (value: number) => string;
  sparklineColor?: string;
  getValue: (kpis: OverviewKPI) => number;
  getSparkline: (kpis: OverviewKPI) => SparklinePoint[];
}

const KPI_ENTRIES: KPIEntry[] = [
  {
    key: "totalSources",
    label: "Sources",
    icon: Server,
    format: formatNumber,
    color: () => "text-indigo-400",
    getValue: (k) => k.totalSources,
    getSparkline: () => [],
  },
  {
    key: "totalGroups",
    label: "Groups",
    icon: FolderTree,
    format: formatNumber,
    color: () => "text-violet-400",
    getValue: (k) => k.totalGroups,
    getSparkline: () => [],
  },
  {
    key: "totalEndpoints",
    label: "Endpoints",
    icon: Zap,
    format: formatNumber,
    color: () => "text-sky-400",
    getValue: (k) => k.totalEndpoints,
    getSparkline: () => [],
  },
  {
    key: "overallHealth",
    label: "Health",
    icon: HeartPulse,
    format: fmtPercent,
    color: healthColor,
    sparklineColor: "var(--chart-2)",
    getValue: (k) => k.overallHealth,
    getSparkline: (k) => k.healthSparkline,
  },
  {
    key: "throughputPerMin",
    label: "Throughput",
    icon: Activity,
    format: fmtThroughput,
    color: () => "text-emerald-400",
    sparklineColor: "var(--chart-4)",
    getValue: (k) => k.throughputPerMin,
    getSparkline: (k) => k.throughputSparkline,
  },
];

// ── Component ───────────────────────────────────────────────────────────────

interface KPIStripProps {
  kpis: OverviewKPI;
}

export function KPIStrip({ kpis }: KPIStripProps): React.ReactElement {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {KPI_ENTRIES.map((entry) => {
        const value = entry.getValue(kpis);
        const sparkline = entry.getSparkline(kpis);

        return (
          <div key={entry.key} className="rounded-xl border border-border-subtle bg-card p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-muted/50 ring-1 ring-border-subtle">
                  <entry.icon className="size-3.5 text-muted-foreground" />
                </div>
                <span className="text-caption text-muted-foreground/70">{entry.label}</span>
              </div>
              {sparkline.length > 1 && entry.sparklineColor && (
                <Sparkline data={sparkline} color={entry.sparklineColor} />
              )}
            </div>
            <AnimatedCounter
              value={value}
              format={entry.format}
              className={cn("mt-2 block text-h1", entry.color(value))}
            />
          </div>
        );
      })}
    </div>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────

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

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtThroughput(n: number): string {
  return `${n.toFixed(1)}/min`;
}

function healthColor(value: number): string {
  if (value >= 95) return "text-emerald-400";
  if (value >= 80) return "text-amber-400";
  return "text-rose-400";
}
