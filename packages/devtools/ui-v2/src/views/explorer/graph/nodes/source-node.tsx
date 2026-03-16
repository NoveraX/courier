import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { SourceNodeData } from "../../types";
import { getHealthLevel } from "../../compute-metrics";
import { HealthIndicator } from "../../shared/health-indicator";
import { cn } from "@/lib/utils";
import { Database } from "lucide-react";

function SourceNodeComponent({ data, selected }: NodeProps): React.ReactElement {
  const d = data as unknown as SourceNodeData;
  const health = getHealthLevel(d.metrics);
  const isError = health === "critical";

  return (
    <div
      aria-label={`Source: ${d.name}, ${d.groupCount} groups, ${d.endpointCount} endpoints, ${Math.round(d.metrics.successRate)}% health`}
      className={cn(
        "group/node w-60 rounded-lg border-l-[3px] border p-3",
        "bg-[oklch(0.18_0.02_280/0.8)] backdrop-blur-sm",
        "border-[oklch(0.35_0.08_280)] border-l-[oklch(0.65_0.18_280)]",
        "transition-all duration-200 ease-out",
        "hover:scale-[1.01] hover:bg-[oklch(0.20_0.03_280/0.85)] hover:shadow-md",
        selected && "border-accent-brand shadow-[0_0_20px_oklch(0.65_0.18_280/0.35)]",
        d.metrics.isActive && !selected && "shadow-[0_0_14px_oklch(0.65_0.18_280/0.18)]",
        isError && "border-l-rose-400 shadow-[0_0_16px_oklch(0.71_0.19_29/0.25)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-[oklch(0.65_0.18_280/0.15)]">
          <Database className="size-3.5 text-[oklch(0.65_0.18_280)]" />
        </div>
        <span className="text-body-sm font-semibold text-foreground truncate">
          {d.name}
        </span>
        <HealthIndicator level={health} pulse={d.metrics.isActive} className="ml-auto" />
      </div>

      {/* Base URL */}
      <p className="mt-1.5 text-mono-sm text-muted-foreground truncate">
        {d.baseURL}
      </p>

      {/* Stats row */}
      <div className="mt-2.5 flex gap-2.5">
        <Stat label="groups" value={d.groupCount} />
        <Stat label="endpts" value={d.endpointCount} />
        <Stat label="health" value={`${Math.round(d.metrics.successRate)}%`} />
      </div>

      <Handle type="source" position={Position.Right} className="bg-[oklch(0.65_0.18_280)]! size-2! border-0!" />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <div className="flex-1 rounded-md bg-white/[0.04] px-1.5 py-1 text-center">
      <div className="text-body-xs font-semibold text-foreground">{value}</div>
      <div className="text-caption text-muted-foreground">{label}</div>
    </div>
  );
}

export const SourceNode = memo(SourceNodeComponent);
