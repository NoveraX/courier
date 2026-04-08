import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronRight, Clock, Copy, Play } from "lucide-react";
import { getHealthLevel } from "../compute-metrics";
import { HTTP_METHOD_COLORS } from "../constants";
import { HealthIndicator } from "../shared/health-indicator";
import { PathDisplay } from "../shared/path-display";
import { TypeBadge } from "@/components/shared/type-badge";
import { TransportBadge } from "@/views/playground/transport-badge";
import type { EndpointNodeData } from "../types";

// ── Props ────────────────────────────────────────────────────────────────────

interface PanelHeaderProps {
  endpoint: EndpointNodeData;
  onCopyPath?: () => void;
  onOpenTimeline?: () => void;
  onOpenPlayground?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function PanelHeader({
  endpoint,
  onCopyPath,
  onOpenTimeline,
  onOpenPlayground,
}: PanelHeaderProps): React.ReactElement {
  const health = getHealthLevel(endpoint.metrics);
  const methodColor = HTTP_METHOD_COLORS[endpoint.httpMethod] ?? "text-zinc-400 bg-zinc-400/10";

  return (
    <div className="space-y-3">
      {/* Title row: health + badges + name */}
      <div className="flex items-center gap-2">
        <HealthIndicator level={health} pulse={endpoint.metrics.isActive} />
        {endpoint.transport
          ? <TransportBadge transport={endpoint.transport} />
          : <TypeBadge type={endpoint.endpointType} />
        }
        <Badge className={cn("text-[10px] font-bold px-1.5 py-0 rounded-md", methodColor)}>
          {endpoint.httpMethod}
        </Badge>
        <span className="text-body-sm font-semibold text-foreground truncate">
          {endpoint.method}
        </span>
      </div>

      {/* Full path */}
      <PathDisplay path={endpoint.fullPath} className="block text-[11px]" />

      {/* Breadcrumb trail */}
      <div className="flex items-center gap-1 text-body-xs text-muted-foreground/60">
        <span>{endpoint.source}</span>
        <ChevronRight className="size-3" />
        <span>{endpoint.group}</span>
        <ChevronRight className="size-3" />
        <span className="text-foreground/80">{endpoint.method}</span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5">
        <ActionButton icon={Copy} label="Copy path" onClick={onCopyPath} />
        <ActionButton icon={Clock} label="Timeline" onClick={onOpenTimeline} />
        <ActionButton icon={Play} label="Playground" onClick={onOpenPlayground} />
      </div>
    </div>
  );
}

// ── Action Button ────────────────────────────────────────────────────────────

function ActionButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-md border border-border-subtle bg-card/60 px-2.5 py-1.5 text-body-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      title={label}
    >
      <Icon className="size-3.5" />
      <span>{label}</span>
    </button>
  );
}
