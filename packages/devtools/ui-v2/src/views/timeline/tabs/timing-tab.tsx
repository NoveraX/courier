import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";
import type { RequestEntry } from "@/store/types";
import type { RequestTiming, ProxyTiming } from "@/store/types-events";

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

const TIMING_SEGMENTS: { key: keyof RequestTiming; label: string; color: string }[] = [
  { key: "middleware", label: "Middleware", color: "bg-violet-500" },
  { key: "fetch", label: "Fetch", color: "bg-sky-500" },
  { key: "validation", label: "Validation", color: "bg-amber-500" },
];

function TimingBars({ timing }: { timing: RequestTiming }): React.ReactElement {
  return (
    <div>
      <h4 className="text-caption text-muted-foreground mb-3">Request Timing</h4>
      <TimingBar
        label="Total"
        value={timing.total}
        total={timing.total}
        color="bg-emerald-500"
      />
      {TIMING_SEGMENTS.map((seg) => (
        <TimingBar
          key={seg.key}
          label={seg.label}
          value={timing[seg.key]}
          total={timing.total}
          color={seg.color}
        />
      ))}
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

function MiddlewareTiming({
  entries,
}: {
  entries: RequestEntry["middlewareEntries"];
}): React.ReactElement {
  return (
    <div>
      <h4 className="text-caption text-muted-foreground mb-2">Middleware Chain</h4>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {entries.map((mw, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className={cn(
                "size-1.5 rounded-full",
                mw.status === "completed" ? "bg-emerald-400" : mw.status === "error" ? "bg-rose-400" : "bg-amber-400 animate-pulse",
              )} />
              <span className="mono-sm text-foreground">{mw.name}</span>
            </div>
            {mw.duration != null && (
              <span className="mono-sm text-muted-foreground tabular-nums">
                {formatDuration(mw.duration)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
