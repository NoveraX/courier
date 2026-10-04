import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ProxyTiming, RequestTiming } from "@/store/types-events";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Segment {
  label: string;
  value: number;
  color: string;
}

// ── Segment builders ────────────────────────────────────────────────────────

export function buildRequestSegments(timing: RequestTiming): Segment[] {
  const overhead = Math.max(0, timing.total - timing.middleware - timing.fetch - timing.validation);
  const segments: Segment[] = [];
  if (timing.middleware > 0)
    segments.push({ label: "Middleware", value: timing.middleware, color: "bg-violet-500" });
  segments.push({ label: "Fetch", value: timing.fetch, color: "bg-sky-500" });
  if (timing.validation > 0)
    segments.push({ label: "Validation", value: timing.validation, color: "bg-amber-500" });
  if (overhead > 0.5) segments.push({ label: "Overhead", value: overhead, color: "bg-slate-400" });
  return segments;
}

// ── Breakdown card ──────────────────────────────────────────────────────────

export function BreakdownCard({
  title,
  segments,
  total,
}: {
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
            className={cn(
              s.color,
              "first:rounded-l-full last:rounded-r-full transition-all duration-500",
            )}
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
          <span className="mono-sm tabular-nums font-medium text-foreground">
            {formatDuration(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function PhaseRow({ segment, total }: { segment: Segment; total: number }): React.ReactElement {
  const pct = total > 0 ? (segment.value / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
      <div className={cn("size-2 shrink-0 rounded-full", segment.color)} />
      <span className="w-28 shrink-0 text-body-sm text-muted-foreground">{segment.label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/20">
        <div
          className={cn(
            "h-full rounded-full opacity-80 transition-all duration-500",
            segment.color,
          )}
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

// ── Proxy timing helpers ────────────────────────────────────────────────────

const PROXY_PHASES: { key: keyof ProxyTiming; label: string; color: string }[] = [
  { key: "clientToProxy", label: "Client → Proxy", color: "bg-cyan-500" },
  { key: "proxyToBackend", label: "Proxy Processing", color: "bg-sky-500" },
  { key: "backendToProxy", label: "Backend Response", color: "bg-indigo-500" },
  { key: "proxyToClient", label: "Proxy → Client", color: "bg-violet-500" },
];

export function buildProxySegments(timing: ProxyTiming): Segment[] {
  return PROXY_PHASES.map((p) => ({ label: p.label, value: timing[p.key], color: p.color })).filter(
    (s) => s.value > 0,
  );
}

export function computeProxyTotal(timing: ProxyTiming): number {
  return (
    timing.clientToProxy + timing.proxyToBackend + timing.backendToProxy + timing.proxyToClient
  );
}
