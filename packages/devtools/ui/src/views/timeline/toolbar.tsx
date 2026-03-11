import { Search, X, Filter, Pause, Play, Trash2, BookmarkCheck } from "lucide-react"

import type { Filters } from "./filters"
import { hasActiveFilters, countActiveFilters } from "./filters"

// Re-export FilterBar for backward compatibility
export { FilterBar } from "./filter-bar"

export function Toolbar({
  filters,
  setFilters,
  showFilters,
  setShowFilters,
  paused,
  onTogglePause,
  preserveLog,
  onTogglePreserveLog,
  onClear,
  total,
  filtered,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  showFilters: boolean
  setShowFilters: (v: boolean) => void
  paused: boolean
  onTogglePause: () => void
  preserveLog: boolean
  onTogglePreserveLog: () => void
  onClear: () => void
  total: number
  filtered: number
}) {
  const active = hasActiveFilters(filters)

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
      {/* Search */}
      <div className="relative flex-1">
        <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          placeholder="Search requests..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="h-7 w-full rounded bg-surface-1 pl-7 pr-7 text-xs text-text-primary outline-none placeholder:text-text-muted focus:ring-1 focus:ring-indigo-500/50"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, search: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Count */}
      <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
        {active ? `${filtered}/${total}` : total}
      </span>

      {/* Filter toggle */}
      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        className={`flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors ${
          showFilters || active
            ? "bg-indigo-500/15 text-indigo-400"
            : "bg-surface-2 text-text-secondary hover:text-text-primary"
        }`}
        title="Toggle filters"
      >
        <Filter size={12} />
        {active && <span className="text-[10px]">{countActiveFilters(filters)}</span>}
      </button>

      {/* Preserve log */}
      <button
        type="button"
        onClick={onTogglePreserveLog}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          preserveLog
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-surface-2 text-text-secondary hover:text-text-primary"
        }`}
        title={preserveLog ? "Preserve log: ON (pinned kept on clear)" : "Preserve log: OFF"}
      >
        <BookmarkCheck size={12} />
      </button>

      {/* Pause */}
      <button
        type="button"
        onClick={onTogglePause}
        className={`flex h-7 w-7 items-center justify-center rounded transition-colors ${
          paused
            ? "bg-amber-500/20 text-amber-400"
            : "bg-surface-2 text-text-secondary hover:text-text-primary"
        }`}
        title={paused ? "Resume recording" : "Pause recording"}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
      </button>

      {/* Clear */}
      <button
        type="button"
        onClick={onClear}
        className="flex h-7 w-7 items-center justify-center rounded bg-surface-2 text-text-secondary transition-colors hover:text-text-primary"
        title="Clear all requests"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}
