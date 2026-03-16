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
      className={cn(
        "group/node w-55 rounded-lg border-l-[3px] border p-3",
        "bg-[oklch(0.18_0.02_310/0.8)] backdrop-blur-sm",
        "border-[oklch(0.35_0.08_310)] border-l-[oklch(0.50_0.12_310)]",
        "transition-all duration-200 ease-out",
        "hover:scale-[1.01] hover:bg-[oklch(0.20_0.03_310/0.85)] hover:shadow-md",
        selected && "border-accent-brand shadow-[0_0_20px_oklch(0.65_0.18_280/0.35)]",
        d.metrics.isActive && !selected && "border-l-[oklch(0.60_0.15_310)]",
        isError && "border-l-rose-400 shadow-[0_0_14px_oklch(0.71_0.19_29/0.2)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex size-5 items-center justify-center rounded bg-[oklch(0.50_0.12_310/0.15)]">
          <Folder className="size-3 text-[oklch(0.50_0.12_310)]" />
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

      <Handle type="target" position={Position.Left} className="bg-[oklch(0.50_0.12_310)]! size-2! border-0!" />
      <Handle type="source" position={Position.Right} className="bg-[oklch(0.50_0.12_310)]! size-2! border-0!" />
    </div>
  );
}

export const GroupNode = memo(GroupNodeComponent);
