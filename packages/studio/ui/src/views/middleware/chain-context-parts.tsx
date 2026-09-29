import { TrendingDown, TrendingUp } from "lucide-react";
import { STATUS_CONFIG } from "@/components/shared/detail-panel/constants";
import { formatDuration } from "@/components/shared/formatters";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { RequestEntry, RequestStatus } from "@/store/types";
import { durationColor } from "./constants";

// ── Section wrapper ────────────────────────────────────────────────────────

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border-subtle bg-card/50 p-3">
      <h4 className="mb-2 text-caption text-muted-foreground/70">{title}</h4>
      {children}
    </div>
  );
}

// ── Timing row ─────────────────────────────────────────────────────────────

export function TimingRow({
  label,
  value,
  total,
  icon: Icon,
}: {
  label: string;
  value: number;
  total: number;
  icon: React.ElementType;
}): React.ReactElement {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className="size-3 text-muted-foreground/50" />
      <span className="w-20 text-body-xs text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/20">
        <div
          className="h-full rounded-full bg-sky-500/60 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right mono-xs tabular-nums text-muted-foreground">
        {pct.toFixed(0)}%
      </span>
      <span className={cn("w-14 text-right mono-xs tabular-nums", durationColor(value))}>
        {formatDuration(value)}
      </span>
    </div>
  );
}

// ── Comparison row ─────────────────────────────────────────────────────────

export function ComparisonRow({
  name,
  actual,
  avg,
  diffPct,
}: {
  name: string;
  actual: number;
  avg: number;
  diffPct: number;
}): React.ReactElement {
  const isSlower = diffPct > 10;
  const isFaster = diffPct < -10;
  const Icon = isSlower ? TrendingUp : isFaster ? TrendingDown : null;

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="min-w-0 flex-1 truncate mono-xs text-foreground">{name}</span>
      <span className={cn("mono-xs tabular-nums", durationColor(actual))}>
        {formatDuration(actual)}
      </span>
      <span className="text-[10px] text-muted-foreground/50">vs</span>
      <span className="mono-xs tabular-nums text-muted-foreground">{formatDuration(avg)}</span>
      {Icon && <Icon className={cn("size-3", isSlower ? "text-rose-400" : "text-emerald-400")} />}
      {(isSlower || isFaster) && (
        <span
          className={cn(
            "text-[10px] tabular-nums",
            isSlower ? "text-rose-400" : "text-emerald-400",
          )}
        >
          {diffPct > 0 ? "+" : ""}
          {diffPct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────

/** The status code a request was answered with, or how it ended when it got none. */
export function StatusBadge({
  request,
}: {
  request: Pick<RequestEntry, "status" | "statusCode">;
}): React.ReactElement {
  const code = request.statusCode;
  if (code) {
    const variant = code < 300 ? "emerald" : code < 400 ? "amber" : "rose";
    return (
      <Badge variant={variant} className="text-[10px] tabular-nums">
        {code}
      </Badge>
    );
  }
  return (
    <Badge variant={OUTCOME_VARIANT[request.status]} className="text-[10px]">
      {STATUS_CONFIG[request.status].label.toLowerCase()}
    </Badge>
  );
}

const OUTCOME_VARIANT = {
  pending: "outline",
  success: "emerald",
  error: "rose",
  aborted: "outline",
  validation_error: "amber",
} as const satisfies Record<RequestStatus, string>;
