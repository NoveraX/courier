import { ArrowRight, Globe, Monitor, Server } from "lucide-react";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";
import type { ProxyTiming } from "@/store/types-events";
import { ProxyWaterfall } from "./proxy-waterfall";

interface ProxyTabProps {
  request: RequestEntry;
}

export function ProxyTab({ request }: ProxyTabProps): React.ReactElement {
  if (request.mode !== "proxy") {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">
        Direct mode — no proxy data
      </p>
    );
  }
  if (!request.proxyTiming) {
    return (
      <p className="py-8 text-center text-body-sm text-muted-foreground">No proxy timing data</p>
    );
  }

  const t = request.proxyTiming;
  const total = t.clientToProxy + t.proxyToBackend + t.backendToProxy + t.proxyToClient;

  return (
    <div className="space-y-5 p-4">
      <ProxyWaterfall timing={t} total={total} />
      <FlowDiagram timing={t} />
      <MetricsBreakdown timing={t} total={total} />
    </div>
  );
}

// ── Flow diagram ──────────────────────────────────────────────────────────

export function FlowDiagram({ timing }: { timing: ProxyTiming }): React.ReactElement {
  return (
    <div>
      <h4 className="mb-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Request Flow
      </h4>
      <div className="rounded-lg border border-border-subtle bg-card/50 px-6 py-5">
        <div className="flex items-center justify-between">
          <FlowNode icon={Monitor} label="Client" />
          <FlowLink forward={timing.clientToProxy} backward={timing.proxyToClient} />
          <FlowNode icon={Server} label="Proxy" accent />
          <FlowLink forward={timing.proxyToBackend} backward={timing.backendToProxy} />
          <FlowNode icon={Globe} label="Backend" />
        </div>
      </div>
    </div>
  );
}

function FlowNode({
  icon: Icon,
  label,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  accent?: boolean;
}): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={cn(
          "flex size-10 items-center justify-center rounded-xl border bg-card shadow-sm",
          accent ? "border-sky-500/30 shadow-sky-500/5" : "border-border-subtle",
        )}
      >
        <Icon className={cn("size-4", accent ? "text-sky-400" : "text-muted-foreground")} />
      </div>
      <span className="text-caption text-muted-foreground">{label}</span>
    </div>
  );
}

function FlowLink({
  forward,
  backward,
}: {
  forward: number;
  backward: number;
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3">
      <div className="flex items-center gap-1.5">
        <div className="h-px flex-1 bg-border" />
        <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
        <span className="shrink-0 text-[10px] tabular-nums text-sky-400">
          {formatDuration(forward)}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
          {formatDuration(backward)}
        </span>
        <ArrowRight className="size-3 shrink-0 rotate-180 text-muted-foreground/30" />
        <div className="h-px flex-1 bg-border/50" />
      </div>
    </div>
  );
}

// ── Metrics breakdown ─────────────────────────────────────────────────────

const METRICS: { key: keyof ProxyTiming; label: string }[] = [
  { key: "clientToProxy", label: "Client → Proxy" },
  { key: "proxyToBackend", label: "Proxy Processing" },
  { key: "backendToProxy", label: "Backend Response" },
  { key: "proxyToClient", label: "Proxy → Client" },
];

function MetricsBreakdown({
  timing,
  total,
}: {
  timing: ProxyTiming;
  total: number;
}): React.ReactElement {
  const hasClient = timing.clientToProxy > 0 || timing.proxyToClient > 0;
  const serverTotal = timing.proxyToBackend + timing.backendToProxy;
  const visibleMetrics = METRICS.filter((m) => {
    if (!hasClient && (m.key === "clientToProxy" || m.key === "proxyToClient")) return false;
    return timing[m.key] > 0;
  });

  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Breakdown
      </h4>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {visibleMetrics.map((m) => {
          const value = timing[m.key];
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <div
              key={m.key}
              className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0"
            >
              <span className="w-28 shrink-0 text-body-sm text-muted-foreground">{m.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/20">
                <div
                  className="h-full rounded-full bg-sky-500/60 transition-all duration-500"
                  style={{ width: `${Math.max(pct, 1)}%` }}
                />
              </div>
              <span className="w-12 shrink-0 text-right text-caption tabular-nums text-muted-foreground/60">
                {pct.toFixed(1)}%
              </span>
              <span className="w-16 shrink-0 text-right mono-sm tabular-nums text-foreground">
                {formatDuration(value)}
              </span>
            </div>
          );
        })}
        <SummaryRow label="Server Total" value={serverTotal} />
        {hasClient && <SummaryRow label="Round Trip" value={total} />}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="flex items-center justify-between border-t border-border-subtle bg-muted/20 px-3 py-2">
      <span className="text-body-sm font-medium text-foreground">{label}</span>
      <span className="mono-sm tabular-nums font-medium text-foreground">
        {formatDuration(value)}
      </span>
    </div>
  );
}
