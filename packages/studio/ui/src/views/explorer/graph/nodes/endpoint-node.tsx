import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { EndpointNodeData } from "../../types";
import { getHealthLevel } from "../../compute-metrics";
import { HealthIndicator } from "../../shared/health-indicator";
import { TypeBadge } from "@/components/shared/type-badge";
import { TransportBadge } from "@/views/playground/transport-badge";
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
      style={{
        background: "var(--graph-node-ep-bg)",
        borderColor: "var(--graph-node-ep-border)",
      }}
      className={cn(
        "group/node w-70 rounded-lg border p-2.5 backdrop-blur-sm",
        "transition-all duration-200 ease-out",
        "hover:scale-[1.01] hover:brightness-110 hover:shadow-md",
        selected && "border-accent-brand shadow-[0_0_20px_var(--glow-brand)]",
        isError && "border-destructive shadow-[0_0_14px_var(--destructive)]",
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
        {d.transport ? <TransportBadge transport={d.transport} /> : <TypeBadge type={d.endpointType} />}
        <HealthIndicator level={health} pulse={d.metrics.isActive} />
      </div>

      {/* Full resolved path */}
      <div className="mt-1 flex items-center gap-1.5">
        <PathDisplay path={d.fullPath} className="truncate flex-1" />
        <SchemaIndicators hasVariables={d.hasVariablesSchema} hasResponse={d.hasResponseSchema} />
      </div>

      {/* Separator */}
      <div className="mt-2 border-t border-border-subtle" />

      {/* Inline metrics */}
      <div className="mt-1.5 flex items-center gap-2 text-body-xs text-muted-foreground">
        <span>{d.metrics.totalRequests} calls</span>
        <span className="text-border-subtle">·</span>
        <span className={latencyColor(d.metrics.avgResponseTime)}>
          {Math.round(d.metrics.avgResponseTime)}ms avg
        </span>
        <span className="text-border-subtle">·</span>
        <span className={d.metrics.errorCount > 0 ? "text-rose-400" : ""}>
          {d.metrics.errorCount} err
        </span>
      </div>

      <Handle type="target" position={Position.Left} className="bg-muted-foreground! size-2! border-0!" />
    </div>
  );
}

function latencyColor(ms: number): string {
  if (ms < 200) return "text-emerald-400";
  if (ms < 500) return "text-amber-400";
  return "text-rose-400";
}

export const EndpointNode = memo(EndpointNodeComponent);
