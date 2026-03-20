import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { GroupNodeData } from "../../types";
import { getHealthLevel } from "../../compute-metrics";
import { HealthIndicator } from "../../shared/health-indicator";
import { cn } from "@/lib/utils";
import { Folder } from "lucide-react";

function GroupNodeComponent({ data, selected }: NodeProps): React.ReactElement {
  const d = data as unknown as GroupNodeData;
  const health = getHealthLevel(d.metrics);
  const isError = health === "critical";

  return (
    <div
      aria-label={`Group: ${d.name}, ${d.endpointCount} endpoints, ${Math.round(d.metrics.successRate)}% health`}
      style={{
        background: "var(--graph-node-group-bg)",
        borderColor: "var(--graph-node-group-border)",
      }}
      className={cn(
        "group/node w-55 rounded-lg border-l-[3px] border p-3 backdrop-blur-sm",
        "transition-all duration-200 ease-out",
        "hover:scale-[1.01] hover:brightness-110 hover:shadow-md",
        selected && "border-accent-brand shadow-[0_0_20px_var(--glow-brand)]",
        isError && "border-l-rose-400 shadow-[0_0_14px_var(--destructive)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex size-5 items-center justify-center rounded" style={{ background: "color-mix(in oklch, var(--graph-node-group-border) 15%, transparent)" }}>
          <Folder className="size-3" style={{ color: "var(--graph-node-group-border)" }} />
        </div>
        <span className="text-body-sm font-semibold text-foreground truncate">
          {d.name}
        </span>
      </div>

      {/* Prefix path */}
      <p className="mt-1.5 text-mono-sm text-muted-foreground truncate">
        {d.prefix || `/${d.name}`}
      </p>

      {/* Summary line */}
      <div className="mt-2 flex items-center gap-2 text-body-xs text-muted-foreground">
        <span>{d.endpointCount} endpoints</span>
        <HealthIndicator level={health} pulse={d.metrics.isActive} />
        <span>{Math.round(d.metrics.successRate)}%</span>
      </div>

      <Handle type="target" position={Position.Left} style={{ background: "var(--graph-node-group-border)" }} className="size-2! border-0!" />
      <Handle type="source" position={Position.Right} style={{ background: "var(--graph-node-group-border)" }} className="size-2! border-0!" />
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);
