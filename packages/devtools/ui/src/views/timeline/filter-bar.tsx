import type { RequestEntry, RequestStatus } from "../../store"
import type { Filters } from "./filters"

import { MultiSelect } from "../../components/multi-select"
import { STATUS_CONFIG } from "./constants"
import { hasActiveFilters, EMPTY_FILTERS } from "./filters"

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
      <MultiSelect
        label="Status"
        options={
          ["pending", "success", "error", "aborted", "validation_error"] as RequestStatus[]
        }
        selected={filters.status}
        onChange={(v) => setFilters({ ...filters, status: v })}
        renderOption={(o) => STATUS_CONFIG[o]?.label ?? o}
      />

      <MultiSelect
        label="Mode"
        options={["direct", "proxy"]}
        selected={filters.mode}
        onChange={(v) => setFilters({ ...filters, mode: v })}
      />

      <MultiSelect
        label="Type"
        options={["query", "mutation"]}
        selected={filters.type}
        onChange={(v) => setFilters({ ...filters, type: v })}
      />

      {availableSources.length > 1 && (
        <MultiSelect
          label="Source"
          options={availableSources}
          selected={filters.source}
          onChange={(v) => setFilters({ ...filters, source: v })}
        />
      )}

      {availableGroups.length > 1 && (
        <MultiSelect
          label="Group"
          options={availableGroups}
          selected={filters.group}
          onChange={(v) => setFilters({ ...filters, group: v })}
        />
      )}

      {availableMethods.length > 0 && (
        <MultiSelect
          label="Method"
          options={availableMethods}
          selected={filters.httpMethod}
          onChange={(v) => setFilters({ ...filters, httpMethod: v })}
        />
      )}

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
