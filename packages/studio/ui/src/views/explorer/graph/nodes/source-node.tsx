import type { NodeProps } from "@xyflow/react";
import { Handle, Position } from "@xyflow/react";
import { Database } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";
import { getHealthLevel } from "../../compute-metrics";
import { HealthIndicator } from "../../shared/health-indicator";
import type { SourceNodeData } from "../../types";

function SourceNodeComponent({ data, selected }: NodeProps): React.ReactElement {
  const d = data as unknown as SourceNodeData;
  const health = getHealthLevel(d.metrics);
  const isError = health === "critical";

  return (
    <div
      style={{
        background: "var(--graph-node-source-bg)",
        borderColor: "var(--graph-node-source-border)",
      }}
      className={cn(
        "group/node w-60 rounded-lg border-l-[3px] border p-3 backdrop-blur-sm",
        "transition-all duration-200 ease-out",
        "hover:scale-[1.01] hover:brightness-110 hover:shadow-md",
        selected && "border-accent-brand shadow-[0_0_20px_var(--glow-brand)]",
        d.metrics.isActive && !selected && "shadow-[0_0_14px_var(--glow-brand)]",
        isError && "border-l-rose-400 shadow-[0_0_16px_var(--destructive)]",
      )}
    >
      <span className="sr-only">{`Source: ${d.name}, ${d.groupCount} groups, ${d.endpointCount} endpoints, ${Math.round(d.metrics.successRate)}% health`}</span>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-accent-brand/15">
          <Database className="size-3.5 text-accent-brand" />
        </div>
        <span className="text-body-sm font-semibold text-foreground truncate">{d.name}</span>
        <HealthIndicator level={health} pulse={d.metrics.isActive} className="ml-auto" />
      </div>

      {/* Base URL */}
      <p className="mt-1.5 text-mono-sm text-muted-foreground truncate">{d.baseURL}</p>

      {/* Stats row */}
      <div className="mt-2.5 flex gap-2.5">
        <Stat label="groups" value={d.groupCount} />
        <Stat label="endpts" value={d.endpointCount} />
        <Stat label="health" value={`${Math.round(d.metrics.successRate)}%`} />
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="bg-accent-brand! size-2! border-0!"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <div className="flex-1 rounded-md bg-foreground/[0.04] px-1.5 py-1 text-center">
      <div className="text-body-xs font-semibold text-foreground">{value}</div>
      <div className="text-caption text-muted-foreground">{label}</div>
    </div>
  );
}

export const SourceNode = memo(SourceNodeComponent);
