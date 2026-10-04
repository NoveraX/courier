import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import { HealthIndicator } from "../../shared/health-indicator";

// ── Props ────────────────────────────────────────────────────────────────────

interface RequestsTabProps {
  /** The endpoint's latest calls, newest first, listed in that order */
  requests: RequestEntry[];
  onNavigateToTimeline?: (requestId: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RequestsTab({
  requests,
  onNavigateToTimeline,
}: RequestsTabProps): React.ReactElement {
  if (requests.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-body-xs text-muted-foreground/60">
        No requests recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {requests.map((req) => (
        <RequestRow key={req.id} request={req} onClick={() => onNavigateToTimeline?.(req.id)} />
      ))}
    </div>
  );
}

// ── Request Row ──────────────────────────────────────────────────────────────

function RequestRow({
  request,
  onClick,
}: {
  request: RequestEntry;
  onClick?: () => void;
}): React.ReactElement {
  const isStreaming = request.streamStatus === "streaming";
  const health = isStreaming ? "healthy" : statusToHealth(request.status);
  const duration = request.timing?.total ?? request.streamDuration;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-card/80"
    >
      <HealthIndicator level={health} size="sm" pulse={isStreaming} />

      <span className="text-[11px] text-muted-foreground/50 tabular-nums shrink-0">
        {formatTimestamp(request.startedAt)}
      </span>

      {request.statusCode && (
        <span
          className={cn("text-[11px] tabular-nums shrink-0", statusCodeColor(request.statusCode))}
        >
          {request.statusCode}
        </span>
      )}

      <span
        className={cn(
          "ml-auto text-[11px] tabular-nums shrink-0",
          isStreaming ? "text-emerald-400" : "text-muted-foreground/40",
        )}
      >
        {isStreaming ? "streaming" : duration != null ? formatDuration(duration) : "pending"}
      </span>
    </button>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusToHealth(
  status: RequestEntry["status"],
): "healthy" | "degraded" | "critical" | "inactive" {
  if (status === "success") return "healthy";
  if (status === "pending") return "inactive";
  if (status === "validation_error") return "degraded";
  return "critical";
}

function statusCodeColor(code: number): string {
  if (code >= 500) return "text-rose-400";
  if (code >= 400) return "text-amber-400";
  return "text-emerald-400";
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}
