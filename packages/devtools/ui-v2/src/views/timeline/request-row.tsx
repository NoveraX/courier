import { memo } from "react";
import { Pin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MethodBadge } from "@/components/shared/method-badge";
import { formatDuration, formatAbsoluteTime } from "@/components/shared/formatters";
import type { RequestEntry } from "@/store/types";
import { STATUS_CONFIG } from "./constants";

interface RequestRowProps {
  request: RequestEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}

export const RequestRow = memo(function RequestRow({
  request,
  selected,
  onSelect,
}: RequestRowProps): React.ReactElement {
  const status = STATUS_CONFIG[request.status];
  const path = buildPath(request);
  const hasMetrics = Boolean(request.statusCode) || request.timing?.total != null;

  return (
    <button
      type="button"
      className={cn(
        "group flex w-full items-center gap-3 px-3 text-left",
        "h-9 transition-colors duration-75",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        selected && "bg-accent-brand/8 hover:bg-accent-brand/12",
        request.pinned && !selected && "bg-violet-500/5",
      )}
      onClick={() => onSelect(request.id)}
      data-request-id={request.id}
    >
      {/* Status dot */}
      <span className={cn("size-2 shrink-0 rounded-full", status.dot)} />

      {/* Method — fixed-width cell for column alignment */}
      <span className="inline-flex w-[4.25rem] shrink-0 items-center">
        <MethodBadge method={request.httpMethod ?? "GET"} />
      </span>

      {/* Full path: source.group.method */}
      <span className="min-w-0 flex-1 truncate mono-sm text-foreground">
        {path}
      </span>

      {/* Mode */}
      <Badge
        variant={request.mode === "proxy" ? "sky" : "secondary"}
        className="shrink-0 text-[9px] px-1.5 py-0"
      >
        {request.mode}
      </Badge>

      {/* Metrics pill — status code + duration kept together */}
      {hasMetrics && (
        <span className="inline-flex shrink-0 items-center gap-2 rounded-md bg-muted/50 px-2 py-0.5">
          {request.statusCode && <StatusCode code={request.statusCode} />}
          {request.statusCode && request.timing?.total != null && (
            <span className="h-3 w-px bg-border" />
          )}
          {request.timing?.total != null && (
            <DurationCell duration={request.timing.total} />
          )}
        </span>
      )}

      {/* Time */}
      <span className="inline-flex w-24 shrink-0 items-center justify-end mono-sm tabular-nums text-muted-foreground">
        {formatAbsoluteTime(request.startedAt)}
      </span>

      {/* Pin indicator */}
      {request.pinned && (
        <Pin className="size-3 shrink-0 text-violet-400" />
      )}
    </button>
  );
});

function buildPath(r: RequestEntry): string {
  const parts: string[] = [];
  if (r.source) parts.push(r.source);
  if (r.group) parts.push(r.group);
  parts.push(r.method);
  return parts.join(".");
}

function StatusCode({ code }: { code: number }): React.ReactElement {
  const color = code >= 500
    ? "text-rose-400"
    : code >= 400
      ? "text-orange-400"
      : code >= 300
        ? "text-amber-400"
        : "text-emerald-400";

  return (
    <span className={cn("mono-sm tabular-nums", color)}>
      {code}
    </span>
  );
}

function DurationCell({ duration }: { duration: number }): React.ReactElement {
  const color = duration > 1000
    ? "text-rose-400"
    : duration > 300
      ? "text-amber-400"
      : "text-muted-foreground";

  return (
    <span className={cn("mono-sm tabular-nums", color)}>
      {formatDuration(duration)}
    </span>
  );
}
