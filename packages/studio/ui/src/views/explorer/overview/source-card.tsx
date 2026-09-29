import { FolderTree, Server, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHealthLevel } from "../compute-metrics";
import { HealthIndicator } from "../shared/health-indicator";

import type { SourceNodeData } from "../types";

// ── Component ───────────────────────────────────────────────────────────────

interface SourceCardProps {
  source: SourceNodeData;
}

export function SourceCard({ source }: SourceCardProps): React.ReactElement {
  const level = getHealthLevel(source.metrics);

  return (
    <div className="group rounded-xl border border-border-subtle bg-card p-4 transition-colors hover:border-border">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20">
            <Server className="size-4 text-indigo-400" />
          </div>
          <div>
            <h4 className="text-body-sm font-semibold text-foreground">{source.name}</h4>
            {source.baseURL && (
              <span className="text-mono-xs text-muted-foreground/60 truncate max-w-45 block">
                {source.baseURL}
              </span>
            )}
          </div>
        </div>
        <HealthIndicator level={level} pulse={source.metrics.isActive} />
      </div>

      {/* Stats row */}
      <div className="mt-4 flex items-center gap-4 text-body-xs text-muted-foreground">
        {source.groupCount > 0 ? (
          <StatItem icon={FolderTree} value={source.groupCount} label="groups" />
        ) : (
          <span className="flex items-center gap-1">
            <FolderTree className="size-3 text-muted-foreground/50" />
            <span className="text-muted-foreground/60 italic">flat</span>
          </span>
        )}
        <StatItem icon={Zap} value={source.endpointCount} label="endpoints" />
        <span className="ml-auto tabular-nums">
          {source.metrics.totalRequests > 0
            ? `${source.metrics.successRate.toFixed(0)}% health`
            : "—"}
        </span>
      </div>

      {/* Health bar */}
      <div className="mt-3 h-1 rounded-full bg-border-subtle/50 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            level === "healthy" && "bg-emerald-400/70",
            level === "degraded" && "bg-amber-400/70",
            level === "critical" && "bg-rose-400/70",
            level === "inactive" && "bg-zinc-500/40",
          )}
          style={{
            width: level === "inactive" ? "0%" : `${Math.min(source.metrics.successRate, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

// ── Stat item ───────────────────────────────────────────────────────────────

function StatItem({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Server;
  value: number;
  label: string;
}): React.ReactElement {
  return (
    <span className="flex items-center gap-1">
      <Icon className="size-3 text-muted-foreground/50" />
      <span className="tabular-nums font-medium text-foreground/80">{value}</span>
      <span>{label}</span>
    </span>
  );
}
