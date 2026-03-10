import { useEffect } from "react"
import { Activity, Filter } from "lucide-react"

import { useDevToolsStore, EMPTY_FILTERS } from "../../store"
import { Toolbar, FilterBar } from "./toolbar"
import { VirtualRequestList } from "./request-list"
import { DetailPanel } from "./detail-panel"
import { hasActiveFilters, filterRequests } from "./filters"

// ── Timeline View ────────────────────────────────────────────────────────────

export function TimelineView() {
  const {
    requests,
    selectedRequestId,
    selectRequest,
    togglePaused,
    paused,
    preserveLog,
    togglePreserveLog,
    clearRequests,
    connected,
    togglePin,
    timelineFilters: filters,
    setTimelineFilters: setFilters,
    timelineShowFilters: showFilters,
    setTimelineShowFilters: setShowFilters,
  } = useDevToolsStore()

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

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Request list */}
      <div className="flex flex-1 flex-col overflow-hidden border-r border-border-default">
        {/* Toolbar */}
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

        {/* Filter bar */}
        {showFilters && (
          <FilterBar filters={filters} setFilters={setFilters} requests={requests} />
        )}

        {/* List */}
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
            />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedRequest && (
        <DetailPanel request={selectedRequest} onClose={() => selectRequest(null)} />
      )}
    </div>
  )
}

// ── Empty States ─────────────────────────────────────────────────────────────

function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
      <Activity size={32} strokeWidth={1} />
      <p className="text-sm">
        {connected ? "Waiting for requests..." : "Connecting to server..."}
      </p>
      {connected && (
        <p className="max-w-xs text-center text-xs">
          Call{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-text-secondary">
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
    <div className="flex h-full flex-col items-center justify-center gap-2 text-text-muted">
      <Filter size={28} strokeWidth={1} />
      <p className="text-sm">No requests match filters</p>
      <button
        type="button"
        onClick={onClear}
        className="text-xs text-indigo-400 hover:underline"
      >
        Clear filters
      </button>
    </div>
  )
}
