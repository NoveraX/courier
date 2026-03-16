import { memo } from "react";
import { cn } from "@/lib/utils";
import { MethodBadge } from "@/components/shared/method-badge";
import {
  formatDuration,
  formatNumber,
  formatSize,
} from "@/components/shared/formatters";
import { HealthIndicator } from "../shared/health-indicator";
import { TypeBadge } from "../shared/type-badge";
import { PathDisplay } from "../shared/path-display";
import { getHealthLevel } from "../compute-metrics";
import { formatEndpointKey } from "../helpers";

import type { EndpointNodeData } from "../types";

// ── Props ──────────────────────────────────────────────────────────────────

interface EndpointRowProps {
  endpoint: EndpointNodeData;
  isSelected: boolean;
  onSelect: (key: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export const EndpointRow = memo(function EndpointRow({
  endpoint,
  isSelected,
  onSelect,
}: EndpointRowProps): React.ReactElement {
  const { metrics } = endpoint;
  const health = getHealthLevel(metrics);
  const key = formatEndpointKey(endpoint.source, endpoint.group, endpoint.method);

  return (
    <tr
      onClick={() => onSelect(key)}
      className={cn(
        "group cursor-pointer border-b border-border-subtle/50 transition-colors",
        isSelected
          ? "bg-accent-brand/5"
          : "hover:bg-muted/30",
      )}
    >
      {/* Health */}
      <td className="w-8 px-3 py-2.5">
        <HealthIndicator level={health} pulse={metrics.isActive} />
      </td>

      {/* Endpoint name */}
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-1.5">
          {endpoint.group && (
            <span className="text-body-xs text-muted-foreground/50">
              {endpoint.group}.
            </span>
          )}
          <span className="text-body-sm font-medium text-foreground/90">
            {endpoint.method}
          </span>
        </div>
      </td>

      {/* Path */}
      <td className="max-w-[200px] px-2 py-2.5">
        <PathDisplay path={endpoint.fullPath} className="truncate text-[11px]" />
      </td>

      {/* Type */}
      <td className="px-2 py-2.5 text-center">
        <TypeBadge type={endpoint.endpointType} className="text-[9px]" />
      </td>

      {/* HTTP Method */}
      <td className="px-2 py-2.5 text-center">
        <MethodBadge method={endpoint.httpMethod} className="text-[9px]" />
      </td>

      {/* Calls */}
      <td className="px-2 py-2.5 text-right tabular-nums text-body-xs text-muted-foreground">
        {formatNumber(metrics.totalRequests)}
      </td>

      {/* Avg time */}
      <td className="px-2 py-2.5 text-right tabular-nums text-body-xs text-muted-foreground">
        {metrics.totalRequests > 0 ? formatDuration(metrics.avgResponseTime) : "—"}
      </td>

      {/* P95 */}
      <td className={cn(
        "px-2 py-2.5 text-right tabular-nums text-body-xs",
        metrics.p95ResponseTime >= 500 ? "text-rose-400" :
        metrics.p95ResponseTime >= 200 ? "text-amber-400" :
        "text-muted-foreground",
      )}>
        {metrics.totalRequests > 0 ? formatDuration(metrics.p95ResponseTime) : "—"}
      </td>

      {/* Error rate */}
      <td className={cn(
        "px-2 py-2.5 text-right tabular-nums text-body-xs",
        metrics.successRate < 80 ? "text-rose-400" :
        metrics.successRate < 95 ? "text-amber-400" :
        "text-muted-foreground",
      )}>
        {metrics.totalRequests > 0
          ? `${metrics.successRate.toFixed(1)}%`
          : "—"}
      </td>

      {/* Avg size */}
      <td className="px-2 py-2.5 text-right tabular-nums text-body-xs text-muted-foreground">
        {metrics.totalRequests > 0 ? formatSize(metrics.avgSize) : "—"}
      </td>
    </tr>
  );
});
