import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { EndpointNodeData } from "../../types";
import { getHealthLevel } from "../../compute-metrics";
import { HealthIndicator } from "../../shared/health-indicator";
import { TypeBadge } from "../../shared/type-badge";
import { PathDisplay } from "../../shared/path-display";
import { SchemaIndicators } from "./schema-indicators";
import { cn } from "@/lib/utils";
import { HTTP_METHOD_COLORS } from "../../constants";

function EndpointNodeComponent({ data, selected }: NodeProps): React.ReactElement {
  const d = data as unknown as EndpointNodeData;
  const health = getHealthLevel(d.metrics);
  const methodColor = HTTP_METHOD_COLORS[d.httpMethod] ?? "text-zinc-400 bg-zinc-400/10";
  const isError = health === "critical";

  return (
    <div
      aria-label={`${d.httpMethod} ${d.method} — ${d.fullPath}, ${d.metrics.totalRequests} calls, ${Math.round(d.metrics.avgResponseTime)}ms avg`}
      className={cn(
        "group/node w-70 rounded-lg border p-2.5",
        "bg-[oklch(0.16_0_0/0.9)] backdrop-blur-sm",
        "border-[oklch(0.28_0_0)]",
        "transition-all duration-200 ease-out",
        "hover:scale-[1.01] hover:bg-[oklch(0.18_0_0/0.95)] hover:shadow-md",
        selected && "border-accent-brand shadow-[0_0_20px_oklch(0.65_0.18_280/0.35)]",
        isError && "border-[oklch(0.50_0.12_29)] shadow-[0_0_14px_oklch(0.71_0.19_29/0.2)]",
      )}
    >
      {/* Header: method badge + name + type + health */}
      <div className="flex items-center gap-1.5">
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold", methodColor)}>
          {d.httpMethod}
        </span>
        <span className="text-body-sm font-semibold text-foreground truncate flex-1">
          {d.method}
        </span>
        <TypeBadge type={d.endpointType} />
        <HealthIndicator level={health} pulse={d.metrics.isActive} />
      </div>

      {/* Full resolved path */}
      <div className="mt-1 flex items-center gap-1.5">
        <PathDisplay path={d.fullPath} className="truncate flex-1" />
        <SchemaIndicators hasVariables={d.hasVariablesSchema} hasResponse={d.hasResponseSchema} />
      </div>

      {/* Separator */}
      <div className="mt-2 border-t border-white/6" />

      {/* Inline metrics */}
      <div className="mt-1.5 flex items-center gap-2 text-body-xs text-muted-foreground">
        <span>{d.metrics.totalRequests} calls</span>
        <span className="text-white/10">·</span>
        <span className={latencyColor(d.metrics.avgResponseTime)}>
          {Math.round(d.metrics.avgResponseTime)}ms avg
        </span>
        <span className="text-white/10">·</span>
        <span className={d.metrics.errorCount > 0 ? "text-rose-400" : ""}>
          {d.metrics.errorCount} err
        </span>
      </div>

      <Handle type="target" position={Position.Left} className="bg-[oklch(0.40_0_0)]! size-2! border-0!" />
    </div>
  );
}

function latencyColor(ms: number): string {
  if (ms < 200) return "text-emerald-400";
  if (ms < 500) return "text-amber-400";
  return "text-rose-400";
}

export const EndpointNode = memo(EndpointNodeComponent);
