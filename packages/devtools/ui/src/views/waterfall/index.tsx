import { useState, useMemo, useRef, useCallback } from "react"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

import type { RequestEntry } from "../../store"
import { useDevToolsStore } from "../../store"
import { formatDuration } from "../../components/ui"
import { STATUS_CONFIG, HTTP_METHOD_COLORS } from "../timeline/constants"

// ── Segment colors ──────────────────────────────────────────────────────────

const SEGMENT_COLORS: Record<string, { bg: string; label: string }> = {
  queued: { bg: "bg-zinc-500", label: "Queued" },
  middleware_req: { bg: "bg-violet-500", label: "Middleware (req)" },
  fetch: { bg: "bg-sky-500", label: "HTTP Fetch" },
  middleware_res: { bg: "bg-violet-400", label: "Middleware (res)" },
  parse: { bg: "bg-amber-500", label: "Parse" },
  validation: { bg: "bg-emerald-500", label: "Validation" },
}

type SortField = "startTime" | "duration" | "size"
type GroupBy = "none" | "source" | "group"

// ── Segment calculation ─────────────────────────────────────────────────────

interface Segment {
  key: string
  start: number
  width: number
  color: string
  label: string
  duration: number
}

function getSegments(r: RequestEntry, timelineStart: number): Segment[] {
  if (!r.timing) return []
  const offset = r.startedAt - timelineStart
  const { middleware, fetch, validation, total } = r.timing

  const middlewareReq = middleware / 2
  const middlewareRes = middleware / 2
  const parse = Math.max(0, total - middleware - fetch - validation)
  const segments: Segment[] = []
  let cursor = offset

  if (middlewareReq > 0) {
    segments.push({ key: "middleware_req", start: cursor, width: middlewareReq, color: SEGMENT_COLORS.middleware_req!.bg, label: "Middleware (req)", duration: middlewareReq })
    cursor += middlewareReq
  }
  if (fetch > 0) {
    segments.push({ key: "fetch", start: cursor, width: fetch, color: SEGMENT_COLORS.fetch!.bg, label: "HTTP Fetch", duration: fetch })
    cursor += fetch
  }
  if (parse > 0) {
    segments.push({ key: "parse", start: cursor, width: parse, color: SEGMENT_COLORS.parse!.bg, label: "Parse", duration: parse })
    cursor += parse
  }
  if (validation > 0) {
    segments.push({ key: "validation", start: cursor, width: validation, color: SEGMENT_COLORS.validation!.bg, label: "Validation", duration: validation })
    cursor += validation
  }
  if (middlewareRes > 0) {
    segments.push({ key: "middleware_res", start: cursor, width: middlewareRes, color: SEGMENT_COLORS.middleware_res!.bg, label: "Middleware (res)", duration: middlewareRes })
  }

  return segments
}

// ── Waterfall View ──────────────────────────────────────────────────────────

export function WaterfallView() {
  const { requests, selectRequest, selectedRequestId } = useDevToolsStore()
  const [sortBy, setSortBy] = useState<SortField>("startTime")
  const [groupBy, setGroupBy] = useState<GroupBy>("none")
  const [zoom, setZoom] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  const completedRequests = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  )

  const sorted = useMemo(() => {
    const arr = [...completedRequests]
    switch (sortBy) {
      case "startTime":
        arr.sort((a, b) => a.startedAt - b.startedAt)
        break
      case "duration":
        arr.sort((a, b) => (b.timing?.total ?? 0) - (a.timing?.total ?? 0))
        break
      case "size":
        arr.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
        break
    }
    return arr
  }, [completedRequests, sortBy])

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ label: null, items: sorted }]
    const map = new Map<string, RequestEntry[]>()
    for (const r of sorted) {
      const key = groupBy === "source" ? r.source : (r.group ?? "ungrouped")
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return Array.from(map, ([label, items]) => ({ label, items }))
  }, [sorted, groupBy])

  const timelineStart = useMemo(() => {
    if (sorted.length === 0) return 0
    return Math.min(...sorted.map((r) => r.startedAt))
  }, [sorted])

  const timelineEnd = useMemo(() => {
    if (sorted.length === 0) return 1000
    return Math.max(...sorted.map((r) => r.startedAt + (r.timing?.total ?? 0)))
  }, [sorted])

  const totalDuration = Math.max(timelineEnd - timelineStart, 1)
  const pxPerMs = (800 * zoom) / totalDuration

  const handleZoomIn = useCallback(() => setZoom((z) => Math.min(z * 1.5, 20)), [])
  const handleZoomOut = useCallback(() => setZoom((z) => Math.max(z / 1.5, 0.5)), [])
  const handleFit = useCallback(() => setZoom(1), [])

  if (completedRequests.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
        <p className="text-sm">No completed requests yet</p>
        <p className="text-xs">Waterfall will appear once requests complete</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default bg-surface-0 px-3 py-1.5">
        <div className="flex items-center gap-3">
          {/* Sort */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-text-muted">Sort:</span>
            {(["startTime", "duration", "size"] as SortField[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setSortBy(f)}
                className={`rounded px-1.5 py-0.5 transition-colors ${sortBy === f ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
              >
                {f === "startTime" ? "Time" : f === "duration" ? "Duration" : "Size"}
              </button>
            ))}
          </div>

          {/* Group by */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-text-muted">Group:</span>
            {(["none", "source", "group"] as GroupBy[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupBy(g)}
                className={`rounded px-1.5 py-0.5 transition-colors ${groupBy === g ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
              >
                {g === "none" ? "None" : g === "source" ? "Source" : "Group"}
              </button>
            ))}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button type="button" onClick={handleZoomOut} className="rounded p-1 text-text-muted hover:bg-surface-1 hover:text-text-secondary" title="Zoom out">
            <ZoomOut size={14} />
          </button>
          <span className="min-w-[3rem] text-center text-[10px] text-text-muted">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={handleZoomIn} className="rounded p-1 text-text-muted hover:bg-surface-1 hover:text-text-secondary" title="Zoom in">
            <ZoomIn size={14} />
          </button>
          <button type="button" onClick={handleFit} className="rounded p-1 text-text-muted hover:bg-surface-1 hover:text-text-secondary" title="Fit to view">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border-subtle bg-surface-0 px-3 py-1">
        {Object.values(SEGMENT_COLORS).map(({ bg, label }) => (
          <div key={label} className="flex items-center gap-1">
            <div className={`h-2 w-3 rounded-sm ${bg}`} />
            <span className="text-[10px] text-text-muted">{label}</span>
          </div>
        ))}
      </div>

      {/* Waterfall content */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: `${Math.max(800, totalDuration * pxPerMs + 240)}px` }}>
          {/* Time ruler */}
          <TimeRuler duration={totalDuration} pxPerMs={pxPerMs} />

          {/* Request rows */}
          {groups.map((group) => (
            <div key={group.label ?? "__all__"}>
              {group.label !== null && (
                <div className="sticky left-0 border-b border-border-subtle bg-surface-1 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {group.label}
                </div>
              )}
              {group.items.map((r) => (
                <WaterfallRow
                  key={r.id}
                  request={r}
                  timelineStart={timelineStart}
                  pxPerMs={pxPerMs}
                  selected={r.id === selectedRequestId}
                  onSelect={() => selectRequest(r.id)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Time Ruler ──────────────────────────────────────────────────────────────

function TimeRuler({ duration, pxPerMs }: { duration: number; pxPerMs: number }) {
  const tickCount = Math.max(2, Math.min(20, Math.floor((duration * pxPerMs) / 80)))
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

function WaterfallRow({
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
  const isSlow = (request.timing?.total ?? 0) > 500

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
