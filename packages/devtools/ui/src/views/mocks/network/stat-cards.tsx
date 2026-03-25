import { AnimatedCounter } from "@/components/shared/animated-counter";
import { cn } from "@/lib/utils";

// ── Percentile Card ──────────────────────────────────────────────────────────

interface PercentileCardProps {
  label: string;
  value: number;
  highlight?: boolean;
  danger?: boolean;
}

export function PercentileCard({ label, value, highlight, danger }: PercentileCardProps): React.ReactElement {
  return (
    <div className={cn(
      "rounded-lg border p-2.5 text-center",
      danger ? "border-rose-500/20 bg-rose-500/5"
        : highlight ? "border-accent-brand/15 bg-accent-brand/5"
        : "border-border-subtle bg-muted/20",
    )}>
      <div className="text-caption text-muted-foreground/50">{label}</div>
      <div className={cn(
        "mt-0.5 text-h3 tabular-nums",
        danger ? "text-rose-400" : highlight ? "text-accent-brand" : "text-foreground",
      )}>
        {Math.round(value)}
      </div>
      <div className="text-caption text-muted-foreground/40">ms</div>
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

export type StatVariant = "default" | "brand" | "emerald" | "amber" | "danger";

const STAT_STYLES: Record<StatVariant, { card: string; icon: string; iconBg: string }> = {
  default: { card: "border-border-subtle", icon: "text-muted-foreground", iconBg: "bg-muted/50 ring-1 ring-border-subtle" },
  brand: { card: "border-accent-brand/15", icon: "text-accent-brand", iconBg: "bg-accent-brand/10 ring-1 ring-accent-brand/20" },
  emerald: { card: "border-emerald-500/15", icon: "text-emerald-400", iconBg: "bg-emerald-500/10 ring-1 ring-emerald-500/20" },
  amber: { card: "border-amber-500/15", icon: "text-amber-400", iconBg: "bg-amber-500/10 ring-1 ring-amber-500/20" },
  danger: { card: "border-rose-500/15", icon: "text-rose-400", iconBg: "bg-rose-500/10 ring-1 ring-rose-500/20" },
};

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  unit?: string;
  variant?: StatVariant;
}

export function StatCard({ icon: Icon, label, value, unit, variant = "default" }: StatCardProps): React.ReactElement {
  const s = STAT_STYLES[variant];
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border bg-card p-3", s.card)}>
      <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", s.iconBg)}>
        <Icon className={cn("size-4", s.icon)} />
      </div>
      <div>
        <span className="text-caption text-muted-foreground/60">{label}</span>
        <div className="flex items-baseline gap-1">
          <AnimatedCounter value={value} className="text-h3 tabular-nums text-foreground" />
          {unit && <span className="text-caption text-muted-foreground/40">{unit}</span>}
        </div>
      </div>
    </div>
  );
}
