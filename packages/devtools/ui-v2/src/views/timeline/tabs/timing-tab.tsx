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
    <div className="space-y-5 p-4">
      <BreakdownCard
        title="Request Timing"
        segments={buildRequestSegments(request.timing)}
        total={request.timing.total}
      />
      {request.proxyTiming && (
        <BreakdownCard
          title="Proxy Timing"
          segments={buildProxySegments(request.proxyTiming)}
          total={computeProxyTotal(request.proxyTiming)}
        />
      )}
      {request.middlewareEntries.length > 0 && (
        <MiddlewareTiming entries={request.middlewareEntries} />
      )}
    </div>
  );
}

// ── Segment builders ──────────────────────────────────────────────────────

interface Segment {
  label: string;
  value: number;
  color: string;
}

function buildRequestSegments(timing: RequestTiming): Segment[] {
  const overhead = Math.max(
    0,
    timing.total - timing.middleware - timing.fetch - timing.validation,
  );
  const segments: Segment[] = [];
  if (overhead > 0.5) segments.push({ label: "Setup", value: overhead, color: "bg-slate-400" });
  if (timing.middleware > 0.5) segments.push({ label: "Middleware", value: timing.middleware, color: "bg-violet-500" });
  segments.push({ label: "Fetch", value: timing.fetch, color: "bg-sky-500" });
  if (timing.validation > 0.5) segments.push({ label: "Validation", value: timing.validation, color: "bg-amber-500" });
  return segments;
}

const PROXY_PHASES: { key: keyof ProxyTiming; label: string; color: string }[] = [
  { key: "clientToProxy", label: "Client → Proxy", color: "bg-cyan-500" },
  { key: "proxyToBackend", label: "Proxy Processing", color: "bg-sky-500" },
  { key: "backendToProxy", label: "Backend Response", color: "bg-indigo-500" },
  { key: "proxyToClient", label: "Proxy → Client", color: "bg-violet-500" },
];

function buildProxySegments(timing: ProxyTiming): Segment[] {
  return PROXY_PHASES
    .map((p) => ({ label: p.label, value: timing[p.key], color: p.color }))
    .filter((s) => s.value > 0);
}

function computeProxyTotal(timing: ProxyTiming): number {
  return timing.clientToProxy + timing.proxyToBackend + timing.backendToProxy + timing.proxyToClient;
}

// ── Breakdown card ────────────────────────────────────────────────────────

function BreakdownCard({ title, segments, total }: {
  title: string;
  segments: Segment[];
  total: number;
}): React.ReactElement {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {title}
      </h4>
      <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-muted/30">
        {segments.map((s) => (
          <div
            key={s.label}
            className={cn(s.color, "first:rounded-l-full last:rounded-r-full transition-all duration-500")}
            style={{ width: `${Math.max(1, (s.value / total) * 100)}%` }}
            title={`${s.label}: ${formatDuration(s.value)}`}
          />
        ))}
      </div>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {segments.map((s) => (
          <PhaseRow key={s.label} segment={s} total={total} />
        ))}
        <div className="flex items-center justify-between border-t border-border-subtle bg-muted/20 px-3 py-2">
          <span className="text-body-sm font-medium text-foreground">Total</span>
          <span className="mono-sm tabular-nums font-medium text-foreground">{formatDuration(total)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Phase row with inline bar ─────────────────────────────────────────────

function PhaseRow({ segment, total }: { segment: Segment; total: number }): React.ReactElement {
  const pct = total > 0 ? (segment.value / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
      <div className={cn("size-2 shrink-0 rounded-full", segment.color)} />
      <span className="w-28 shrink-0 text-body-sm text-muted-foreground">{segment.label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/20">
        <div
          className={cn("h-full rounded-full opacity-80 transition-all duration-500", segment.color)}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-caption tabular-nums text-muted-foreground/60">
        {pct.toFixed(1)}%
      </span>
      <span className="w-16 shrink-0 text-right mono-sm tabular-nums text-foreground">
        {formatDuration(segment.value)}
      </span>
    </div>
  );
}
