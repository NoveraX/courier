import { useMemo, useRef, useCallback } from "react"
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react"

import type { WaterfallSortField, WaterfallGroupBy } from "../../store"
import { useDevToolsStore } from "../../store"
import { DisconnectedBanner } from "../../components/ui"

import {
  SEGMENT_COLORS, BASE_TIMELINE_WIDTH, LABEL_COLUMN_WIDTH,
  ZOOM_FACTOR, MAX_ZOOM, MIN_ZOOM,
} from "./waterfall-helpers"
import { TimeRuler, WaterfallRow } from "./waterfall-row"

// ── Waterfall View ──────────────────────────────────────────────────────────

export function WaterfallView() {
  const {
    requests, selectRequest, selectedRequestId, connected,
    waterfallSortBy: sortBy, waterfallGroupBy: groupBy, waterfallZoom: zoom,
    setWaterfallSortBy: setSortBy, setWaterfallGroupBy: setGroupBy, setWaterfallZoom: setZoom,
  } = useDevToolsStore()
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
    const map = new Map<string, typeof sorted>()
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
  const pxPerMs = (BASE_TIMELINE_WIDTH * zoom) / totalDuration

  const handleZoomIn = useCallback(() => setZoom(Math.min(zoom * ZOOM_FACTOR, MAX_ZOOM)), [zoom, setZoom])
  const handleZoomOut = useCallback(() => setZoom(Math.max(zoom / ZOOM_FACTOR, MIN_ZOOM)), [zoom, setZoom])
  const handleFit = useCallback(() => setZoom(1), [setZoom])

  if (completedRequests.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        {!connected && <DisconnectedBanner />}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
          <p className="text-sm">No completed requests yet</p>
          <p className="text-xs">Waterfall will appear once requests complete</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!connected && <DisconnectedBanner />}
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default bg-surface-0 px-3 py-1.5">
        <div className="flex items-center gap-3">
          {/* Sort */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-text-muted">Sort:</span>
            {(["startTime", "duration", "size"] as WaterfallSortField[]).map((f) => (
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
            {(["none", "source", "group"] as WaterfallGroupBy[]).map((g) => (
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
        <div style={{ minWidth: `${Math.max(BASE_TIMELINE_WIDTH, totalDuration * pxPerMs + LABEL_COLUMN_WIDTH + 20)}px` }}>
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
