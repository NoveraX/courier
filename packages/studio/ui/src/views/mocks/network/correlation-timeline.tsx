import { useMemo } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { GitBranch } from "lucide-react";

import type { TimelinePoint } from "./network-utils";

interface CorrelationTimelineProps {
  timeline: TimelinePoint[];
  /** Timestamps when fault mode changed — shown as vertical reference lines */
  eventTimestamps?: number[];
}

export function CorrelationTimeline({ timeline, eventTimestamps = [] }: CorrelationTimelineProps): React.ReactElement {
  const data = useMemo(() => timeline.map((p, i) => ({
    idx: i,
    latency: p.avgLatency,
    errorRate: p.errorRate,
    ts: p.timestamp,
  })), [timeline]);

  if (data.length < 3) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-body-xs text-muted-foreground/40">Collecting data…</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <CartesianGrid yAxisId="lat" strokeDasharray="3 3" stroke="oklch(1 0 0 / 7%)" vertical={false} />
        <XAxis dataKey="idx" hide />
        <YAxis yAxisId="lat" orientation="left" tickCount={3} domain={[0, "auto"]}
          tick={{ fontSize: 9, fill: "oklch(0.58 0.015 264 / 0.5)" }}
          tickFormatter={(v: number) => `${Math.round(v)}ms`}
        />
        <YAxis yAxisId="err" orientation="right" tickCount={3} domain={[0, 100]}
          tick={{ fontSize: 9, fill: "oklch(0.58 0.015 264 / 0.5)" }}
          tickFormatter={(v: number) => `${Math.round(v)}%`}
        />
        <Tooltip content={<CustomTooltip />} />

        {/* Error rate bars (background) */}
        <Bar yAxisId="err" dataKey="errorRate" fill="oklch(0.65 0.22 15 / 0.3)"
          radius={[2, 2, 0, 0]} maxBarSize={8}
        />
        {/* Latency line (foreground) */}
        <Line yAxisId="lat" type="monotone" dataKey="latency"
          stroke="oklch(0.65 0.18 280)" strokeWidth={1.5}
          dot={false} activeDot={{ r: 3 }}
        />

        {/* Event markers for fault mode changes */}
        {eventTimestamps.map((ts) => {
          const idx = data.findIndex((d) => Math.abs(d.ts - ts) < 5000);
          return idx >= 0 ? (
            <ReferenceLine key={ts} yAxisId="lat" x={idx}
              stroke="oklch(0.80 0.15 85 / 0.5)"
              strokeDasharray="3 3" strokeWidth={1}
            />
          ) : null;
        })}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function CustomTooltip({ active, payload }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
}): React.ReactElement | null {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border-subtle bg-popover px-2.5 py-1.5 shadow-lg">
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="size-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-caption text-muted-foreground/70">{p.name === "latency" ? "Avg Latency" : "Error Rate"}</span>
          <span className="text-mono-xs font-medium tabular-nums text-foreground">
            {p.name === "latency" ? `${Math.round(p.value)}ms` : `${Math.round(p.value)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

interface CorrelationPanelProps {
  timeline: TimelinePoint[];
  eventTimestamps?: number[];
}

export function CorrelationPanel({ timeline, eventTimestamps }: CorrelationPanelProps): React.ReactElement {
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <GitBranch className="size-3.5 text-muted-foreground/50" />
        <span className="text-caption text-muted-foreground/70">LATENCY + ERROR CORRELATION</span>
        <div className="ml-auto flex items-center gap-3">
          <LegendDot color="bg-accent-brand" label="Latency" />
          <LegendDot color="bg-rose-400/50" label="Error %" />
        </div>
      </div>
      <CorrelationTimeline timeline={timeline} eventTimestamps={eventTimestamps} />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }): React.ReactElement {
  return (
    <div className="flex items-center gap-1">
      <div className={`size-1.5 rounded-full ${color}`} />
      <span className="text-caption text-muted-foreground/50">{label}</span>
    </div>
  );
}
