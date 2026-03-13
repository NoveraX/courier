import { useMemo, useCallback } from "react"
import { getRouteApi } from "@tanstack/react-router"
import { Zap } from "lucide-react"

import { useDevToolsStore } from "../../store"
import { formatDuration, DisconnectedBanner } from "../../components/ui"

import { OVERHEAD_WARN_PERCENT, getOverheadPercent, computeAggregateStats } from "./helpers"
import { MiddlewareChain } from "./middleware-chain"
import { AggregateStatsPanel } from "./aggregate-stats"

const routeApi = getRouteApi("/middleware")

export function MiddlewareView() {
  const {
    requests, connected,
    middlewareShowStats: showStats, setMiddlewareShowStats: setShowStats,
  } = useDevToolsStore()

  const { request: selectedId } = routeApi.useSearch()
  const navigate = routeApi.useNavigate()
  const setSelectedId = useCallback(
    (id: string) => { void navigate({ search: { request: id } }) },
    [navigate],
  )

  const requestsWithMiddleware = useMemo(
    () => requests.filter((r) => r.middlewareCount > 0 && r.status !== "pending"),
    [requests]
  )

  const aggregateStats = useMemo(() => computeAggregateStats(requestsWithMiddleware), [requestsWithMiddleware])

  const selectedRequest = useMemo(
    () => requestsWithMiddleware.find((r) => r.id === selectedId) ?? null,
    [requestsWithMiddleware, selectedId]
  )

  if (requestsWithMiddleware.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        {!connected && <DisconnectedBanner />}
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
          <Zap size={32} strokeWidth={1} />
          <p className="text-sm">No middleware activity</p>
          <p className="text-xs">Requests with middleware will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {!connected && <DisconnectedBanner />}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-70 shrink-0 flex-col border-r border-border-default">
          <div className="flex items-center justify-between border-b border-border-default px-3 py-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Requests ({requestsWithMiddleware.length})
            </span>
            <button type="button" onClick={() => setShowStats(!showStats)} className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${showStats ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-secondary"}`}>
              Stats
            </button>
          </div>

          {showStats ? (
            <AggregateStatsPanel stats={aggregateStats} />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {requestsWithMiddleware.map((r) => {
                const label = [r.source, r.group, r.method].filter(Boolean).join(".")
                const overhead = getOverheadPercent(r)
                const isSelected = r.id === selectedId
                return (
                  <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} className={`flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2 text-left transition-colors hover:bg-surface-1 ${isSelected ? "bg-surface-1" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[11px] text-text-secondary">{label}</div>
                      <div className="flex items-center gap-2 text-[10px] text-text-muted">
                        <span>{r.middlewareCount} middleware</span>
                        <span>{formatDuration(r.timing?.middleware ?? 0)}</span>
                        <span className={overhead > OVERHEAD_WARN_PERCENT ? "text-amber-400" : ""}>{overhead.toFixed(0)}% overhead</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {selectedRequest ? (
            <MiddlewareChain request={selectedRequest} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-[11px] text-text-muted">
              Select a request to inspect middleware chain
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
