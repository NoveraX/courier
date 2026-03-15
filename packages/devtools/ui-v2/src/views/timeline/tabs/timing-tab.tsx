import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";
import type { RequestEntry } from "@/store/types";
import type { RequestTiming, ProxyTiming } from "@/store/types-events";
import { MiddlewareTiming } from "./middleware-timing";

interface TimingTabProps {
  request: RequestEntry;
}

export function TimingTab({ request }: TimingTabProps): React.ReactElement {
  if (!request.timing) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        No timing data available
      </p>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <TimingBars timing={request.timing} />

      {request.proxyTiming && (
        <ProxyTimingBars timing={request.proxyTiming} />
      )}

      {request.middlewareEntries.length > 0 && (
        <MiddlewareTiming entries={request.middlewareEntries} />
      )}
    </div>
  );
}

interface TimingSegment {
  label: string;
  value: number;
  color: string;
}

function computeSegments(timing: RequestTiming): TimingSegment[] {
  const overhead = Math.max(0, timing.total - timing.middleware - timing.fetch - timing.validation);
  const segments: TimingSegment[] = [];
  if (overhead > 0.5) segments.push({ label: "Overhead", value: overhead, color: "bg-slate-400" });
  if (timing.middleware > 0.5) segments.push({ label: "Middleware", value: timing.middleware, color: "bg-violet-500" });
  segments.push({ label: "Fetch", value: timing.fetch, color: "bg-sky-500" });
  if (timing.validation > 0.5) segments.push({ label: "Validation", value: timing.validation, color: "bg-amber-500" });
  return segments;
}

function TimingBars({ timing }: { timing: RequestTiming }): React.ReactElement {
  const segments = computeSegments(timing);

  return (
    <div className="space-y-3">
      <h4 className="text-caption text-muted-foreground">Request Timing</h4>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted/30">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={cn(seg.color, "first:rounded-l-full last:rounded-r-full")}
            style={{ width: `${Math.max(1, (seg.value / timing.total) * 100)}%` }}
            title={`${seg.label}: ${formatDuration(seg.value)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div className={cn("size-2 rounded-full", seg.color)} />
            <span className="text-body-sm text-muted-foreground">{seg.label}</span>
            <span className="mono-sm tabular-nums text-foreground">{formatDuration(seg.value)}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border-subtle">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-body-sm font-medium text-foreground">Total</span>
          <span className="mono-sm tabular-nums font-medium text-foreground">{formatDuration(timing.total)}</span>
        </div>
      </div>
    </div>
  );
}

const PROXY_SEGMENTS: { key: keyof ProxyTiming; label: string; color: string }[] = [
  { key: "clientToProxy", label: "Client → Proxy", color: "bg-cyan-500" },
  { key: "proxyToBackend", label: "Proxy → Backend", color: "bg-sky-500" },
  { key: "backendToProxy", label: "Backend → Proxy", color: "bg-indigo-500" },
  { key: "proxyToClient", label: "Proxy → Client", color: "bg-violet-500" },
];

function ProxyTimingBars({ timing }: { timing: ProxyTiming }): React.ReactElement {
  const total = timing.clientToProxy + timing.proxyToBackend + timing.backendToProxy + timing.proxyToClient;

  return (
    <div>
      <h4 className="text-caption text-muted-foreground mb-3">Proxy Timing</h4>
      {PROXY_SEGMENTS.map((seg) => (
        <TimingBar
          key={seg.key}
          label={seg.label}
          value={timing[seg.key]}
          total={total}
          color={seg.color}
        />
      ))}
    </div>
  );
}

function TimingBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}): React.ReactElement {
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-28 shrink-0 text-body-sm text-muted-foreground">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-muted/30 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right mono-sm tabular-nums text-foreground">
        {formatDuration(value)}
      </span>
    </div>
  );
}

