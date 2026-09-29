import { formatDuration } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";

/** Status dot background class based on HTTP status code */
export function statusDotClass(status?: number, error?: string): string {
  if (error) return "bg-rose-400";
  if (!status) return "bg-amber-400 animate-pulse";
  if (status >= 500) return "bg-fuchsia-400";
  if (status >= 400) return "bg-rose-400";
  if (status >= 300) return "bg-amber-400";
  return "bg-emerald-400";
}

/** Color class for an HTTP status code */
export function statusCodeColor(code: number): string {
  if (code >= 500) return "text-fuchsia-400";
  if (code >= 400) return "text-rose-400";
  if (code >= 300) return "text-amber-400";
  return "text-emerald-400";
}

/** Color class for a duration value */
export function durationColor(ms: number): string {
  if (ms > 1000) return "text-rose-400";
  if (ms > 300) return "text-amber-400";
  return "text-muted-foreground";
}

/** Inline status code badge (colored number) */
export function StatusCode({ code }: { code: number }): React.ReactElement {
  return <span className={cn("mono-sm tabular-nums", statusCodeColor(code))}>{code}</span>;
}

/** Inline duration display (colored, formatted) */
export function DurationCell({ duration }: { duration: number }): React.ReactElement {
  return (
    <span className={cn("mono-sm tabular-nums", durationColor(duration))}>
      {formatDuration(duration)}
    </span>
  );
}

/** Status + duration pill used in request/log rows */
export function MetricsPill({
  statusCode,
  duration,
}: {
  statusCode?: number;
  duration?: number;
}): React.ReactElement | null {
  if (!statusCode && duration == null) return null;

  return (
    <span className="inline-flex shrink-0 items-center gap-2 rounded-md bg-muted/50 px-2 py-0.5">
      {statusCode && <StatusCode code={statusCode} />}
      {statusCode && duration != null && <span className="h-3 w-px bg-border" />}
      {duration != null && <DurationCell duration={duration} />}
    </span>
  );
}
