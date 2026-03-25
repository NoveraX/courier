import { cn } from "@/lib/utils";
import { MiniSparkline } from "./mini-sparkline";
import type { SparklinePoint } from "../use-endpoint-metrics";

// ── Props ────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  valueColor?: string;
  sparkline?: SparklinePoint[];
  sparklineColor?: string;
  subtitle?: string;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  valueColor,
  sparkline,
  sparklineColor,
  subtitle,
  className,
}: MetricCardProps): React.ReactElement {
  return (
    <div
      className={cn(
        "rounded-lg border border-border-subtle bg-card/60 backdrop-blur-sm p-3",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
        {sparkline && <MiniSparkline data={sparkline} color={sparklineColor} />}
      </div>

      <p className={cn("mt-1.5 text-lg font-semibold tabular-nums", valueColor)}>
        {value}
      </p>

      {subtitle && (
        <p className="mt-0.5 text-body-xs text-muted-foreground/60">
          {subtitle}
        </p>
      )}
    </div>
  );
}
