import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

// ── Props ────────────────────────────────────────────────────────────────────

interface StreamWaterfallProps {
  request: RequestEntry;
  /** Maximum width reference in ms (for scaling the bar) */
  maxDuration?: number;
  className?: string;
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Horizontal bar visualizing stream lifetime (start -> end).
 * Color: violet=active, emerald=complete, rose=error.
 * Shows events/sec rate and total bytes transferred.
 */
export function StreamWaterfall({
  request,
  maxDuration = 10_000,
  className,
}: StreamWaterfallProps): React.ReactElement {
  const status = request.streamStatus ?? "streaming";
  const duration = computeDuration(request);
  const barWidth = Math.min((duration / maxDuration) * 100, 100);
  const rate = computeRate(request.streamEventCount ?? 0, duration);
  const bytes = formatBytes(request.streamTotalBytes ?? 0);

  return (
    <div className={cn("space-y-1.5", className)}>
      {/* Bar */}
      <div className="relative h-6 w-full overflow-hidden rounded bg-muted/20">
        <div
          className={cn("absolute inset-y-0 left-0 rounded transition-all", barColor(status))}
          style={{ width: `${Math.max(barWidth, 2)}%` }}
        />
        {/* Labels overlaid */}
        <div className="absolute inset-0 flex items-center justify-between px-2">
          <span className="text-caption tabular-nums text-foreground/80">
            {formatDuration(duration)}
          </span>
          <StatusLabel status={status} />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span className="tabular-nums">{request.streamEventCount ?? 0} events</span>
        <Divider />
        <span className="tabular-nums">{rate} evt/s</span>
        <Divider />
        <span className="tabular-nums">{bytes}</span>
        <Divider />
        <TransportLabel transport={request.transport} />
      </div>
    </div>
  );
}

// ── Status Label ─────────────────────────────────────────────────────────────

function StatusLabel({ status }: { status: string }): React.ReactElement {
  const label = status === "streaming" ? "live" : status;
  return (
    <span className={cn("text-caption font-medium uppercase", statusTextColor(status))}>
      {label}
    </span>
  );
}

// ── Transport Label ──────────────────────────────────────────────────────────

function TransportLabel({ transport }: { transport?: string }): React.ReactElement {
  return (
    <span className="text-caption font-medium uppercase text-muted-foreground/60">
      {transport ?? "http"}
    </span>
  );
}

// ── Divider ──────────────────────────────────────────────────────────────────

function Divider(): React.ReactElement {
  return <span className="h-3 w-px bg-border-subtle" />;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function barColor(status: string): string {
  if (status === "error") return "bg-rose-500/60";
  if (status === "complete") return "bg-emerald-500/60";
  return "bg-violet-500/60 animate-pulse";
}

function statusTextColor(status: string): string {
  if (status === "error") return "text-rose-400";
  if (status === "complete") return "text-emerald-400";
  return "text-violet-400";
}

function computeDuration(r: RequestEntry): number {
  if (r.streamDuration) return r.streamDuration;
  if (r.streamStatus === "streaming") return Date.now() - r.startedAt;
  return 0;
}

function computeRate(eventCount: number, durationMs: number): string {
  if (durationMs <= 0 || eventCount === 0) return "0";
  const perSec = eventCount / (durationMs / 1000);
  return perSec >= 10 ? Math.round(perSec).toString() : perSec.toFixed(1);
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}
