import { Search, X, Filter, Pause, Play, Trash2, BookmarkCheck } from "lucide-react"

import type { RequestEntry, RequestStatus } from "../../store"
import type { Filters } from "./filters"

import { MultiSelect } from "../../components/multi-select"
import { STATUS_CONFIG } from "./constants"
import { hasActiveFilters, countActiveFilters, EMPTY_FILTERS } from "./filters"

// ── Toolbar ──────────────────────────────────────────────────────────────────

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

// ── Filter Bar ───────────────────────────────────────────────────────────────

export function FilterBar({
  filters,
  setFilters,
  requests,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  requests: RequestEntry[]
}) {
  const availableMethods = [
    ...new Set(requests.map((r) => r.httpMethod).filter(Boolean)),
  ] as string[]
  const availableSources = [...new Set(requests.map((r) => r.source))]
  const availableGroups = [
    ...new Set(requests.map((r) => r.group).filter(Boolean)),
  ] as string[]

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2">
      {/* Status */}
      <MultiSelect
        label="Status"
        options={
          ["pending", "success", "error", "aborted", "validation_error"] as RequestStatus[]
        }
        selected={filters.status}
        onChange={(v) => setFilters({ ...filters, status: v })}
        renderOption={(o) => STATUS_CONFIG[o]?.label ?? o}
      />

      {/* Mode */}
      <MultiSelect
        label="Mode"
        options={["direct", "proxy"]}
        selected={filters.mode}
        onChange={(v) => setFilters({ ...filters, mode: v })}
      />

      {/* Type */}
      <MultiSelect
        label="Type"
        options={["query", "mutation"]}
        selected={filters.type}
        onChange={(v) => setFilters({ ...filters, type: v })}
      />

      {/* Source */}
      {availableSources.length > 1 && (
        <MultiSelect
          label="Source"
          options={availableSources}
          selected={filters.source}
          onChange={(v) => setFilters({ ...filters, source: v })}
        />
      )}

      {/* Group */}
      {availableGroups.length > 1 && (
        <MultiSelect
          label="Group"
          options={availableGroups}
          selected={filters.group}
          onChange={(v) => setFilters({ ...filters, group: v })}
        />
      )}

      {/* HTTP method */}
      {availableMethods.length > 0 && (
        <MultiSelect
          label="Method"
          options={availableMethods}
          selected={filters.httpMethod}
          onChange={(v) => setFilters({ ...filters, httpMethod: v })}
        />
      )}

      {/* Min duration */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-text-muted">Min:</span>
        <input
          type="number"
          placeholder="ms"
          value={filters.minDuration ?? ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              minDuration: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="h-6 w-16 rounded bg-surface-1 px-1.5 text-[11px] tabular-nums text-text-primary outline-none placeholder:text-text-muted"
        />
      </div>

      {/* Clear all */}
      {hasActiveFilters(filters) && (
        <button
          type="button"
          onClick={() => setFilters(EMPTY_FILTERS)}
          className="text-[10px] text-indigo-400 hover:underline"
        >
          Clear all
        </button>
      )}
    </div>
  )
}
