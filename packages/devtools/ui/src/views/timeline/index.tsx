import { useEffect, useState } from "react"
import { Activity, Filter } from "lucide-react"

import { useDevToolsStore, EMPTY_FILTERS } from "../../store"
import { Toolbar, FilterBar } from "./toolbar"
import { VirtualRequestList } from "./request-list"
import { DetailPanel } from "./detail-panel"
import { DragHandle } from "./drag-handle"
import { hasActiveFilters, filterRequests } from "./filters"
import { useTimelineSearch } from "./use-timeline-search"

// ── Timeline View ────────────────────────────────────────────────────────────

export function TimelineView() {
  const {
    requests, paused, preserveLog, connected, settings,
    togglePaused, togglePreserveLog, clearRequests, togglePin,
  } = useDevToolsStore()

  const { filters, setFilters, selectedRequestId, selectRequest, showFilters, setShowFilters } =
    useTimelineSearch()

  const selectedRequest = requests.find((r) => r.id === selectedRequestId)
  const filteredRequests = hasActiveFilters(filters)
    ? filterRequests(requests, filters)
    : requests

  // Escape to close detail panel
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selectedRequestId) {
        selectRequest(null)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [selectedRequestId, selectRequest])

  const [detailWidth, setDetailWidth] = useState(480)

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Request list */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Toolbar
          filters={filters}
          setFilters={setFilters}
          showFilters={showFilters}
          setShowFilters={setShowFilters}
          paused={paused}
          onTogglePause={togglePaused}
          preserveLog={preserveLog}
          onTogglePreserveLog={togglePreserveLog}
          onClear={clearRequests}
          total={requests.length}
          filtered={filteredRequests.length}
        />

        {showFilters && (
          <FilterBar filters={filters} setFilters={setFilters} requests={requests} />
        )}

        <div className="flex-1 overflow-hidden">
          {filteredRequests.length === 0 ? (
            requests.length === 0 ? (
              <EmptyState connected={connected} />
            ) : (
              <NoMatchState onClear={() => setFilters(EMPTY_FILTERS)} />
            )
          ) : (
            <VirtualRequestList
              requests={filteredRequests}
              selectedId={selectedRequestId}
              onSelect={selectRequest}
              onTogglePin={togglePin}
              timestampFormat={settings.timestampFormat}
              slowThreshold={settings.slowRequestThreshold}
            />
          )}
        </div>
      </div>

      {/* Detail panel with drag-to-resize */}
      {selectedRequest && (
        <>
          <DragHandle onResize={setDetailWidth} />
          <div style={{ width: detailWidth }} className="shrink-0">
            <DetailPanel request={selectedRequest} onClose={() => selectRequest(null)} />
          </div>
        </>
      )}
    </div>
  )
}

// ── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Activity size={32} strokeWidth={1} />
      <p className="text-sm">
        {connected ? "Waiting for requests..." : "Connecting to server..."}
      </p>
      {connected && (
        <p className="max-w-xs text-center text-xs">
          Call{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
            connectDevTools()
          </code>{" "}
          in your app to start streaming events.
        </p>
      )}
    </div>
  )
}

function NoMatchState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Filter size={28} strokeWidth={1} />
      <p className="text-sm">No requests match filters</p>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-primary hover:underline"
      >
        Clear filters
      </button>
    </div>
  )
}
