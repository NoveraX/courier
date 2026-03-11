import { useMemo } from "react"

import type { RequestEntry } from "../../store"
import { formatDuration } from "../../components/ui"
import { STATUS_CONFIG, HTTP_METHOD_COLORS, TIMING_SLOW_MS } from "../timeline/constants"

import { getSegments, TICK_SPACING_PX } from "./waterfall-helpers"

// ── Time Ruler ──────────────────────────────────────────────────────────────

export function TimeRuler({ duration, pxPerMs }: { duration: number; pxPerMs: number }) {
  const tickCount = Math.max(2, Math.min(20, Math.floor((duration * pxPerMs) / TICK_SPACING_PX)))
  const tickInterval = duration / tickCount
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * tickInterval)

  return (
    <div className="sticky top-0 z-10 flex h-6 border-b border-border-default bg-surface-0">
      <div className="w-[220px] shrink-0" />
      <div className="relative flex-1">
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute top-0 flex h-full flex-col items-center"
            style={{ left: `${t * pxPerMs}px` }}
          >
            <div className="h-2 w-px bg-border-subtle" />
            <span className="text-[9px] text-text-muted">{formatDuration(t)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Waterfall Row ───────────────────────────────────────────────────────────

export function WaterfallRow({
  request,
  timelineStart,
  pxPerMs,
  selected,
  onSelect,
}: {
  request: RequestEntry
  timelineStart: number
  pxPerMs: number
  selected: boolean
  onSelect: () => void
}) {
  const segments = useMemo(() => getSegments(request, timelineStart), [request, timelineStart])
  const statusCfg = STATUS_CONFIG[request.status]
  const methodColor = HTTP_METHOD_COLORS[request.httpMethod ?? "GET"] ?? "text-text-secondary"
  const label = [request.source, request.group, request.method].filter(Boolean).join(".")
  const isSlow = (request.timing?.total ?? 0) > TIMING_SLOW_MS

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-8 w-full items-center border-b border-border-subtle transition-colors hover:bg-surface-1 ${
        selected ? "bg-surface-1" : ""
      }`}
    >
      {/* Label column */}
      <div className="flex w-[220px] shrink-0 items-center gap-2 overflow-hidden px-3">
        <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusCfg.dotClass}`} />
        <span className={`text-[10px] font-medium ${methodColor}`}>{request.httpMethod ?? "GET"}</span>
        <span className="truncate font-mono text-[11px] text-text-secondary">{label}</span>
      </div>

      {/* Bar column */}
      <div className="relative flex-1 pr-3">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className={`group/seg absolute top-1/2 h-4 -translate-y-1/2 rounded-sm ${seg.color} ${isSlow && seg.key === "fetch" ? "opacity-100" : "opacity-80"} hover:opacity-100`}
            style={{
              left: `${seg.start * pxPerMs}px`,
              width: `${Math.max(seg.width * pxPerMs, 2)}px`,
            }}
            title={`${seg.label}: ${formatDuration(seg.duration)}`}
          >
            {/* Tooltip */}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface-3 px-2 py-1 text-[10px] text-text-primary shadow-lg group-hover/seg:block">
              {seg.label}: {formatDuration(seg.duration)}
            </div>
          </div>
        ))}
        {/* Total duration label */}
        {request.timing && (
          <span
            className={`absolute top-1/2 -translate-y-1/2 text-[10px] ${isSlow ? "text-red-400" : "text-text-muted"}`}
            style={{ left: `${(request.startedAt - timelineStart + request.timing.total) * pxPerMs + 6}px` }}
          >
            {formatDuration(request.timing.total)}
          </span>
        )}
      </div>
    </button>
  )
}
