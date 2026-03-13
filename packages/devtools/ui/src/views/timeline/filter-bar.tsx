import { X } from "lucide-react"

import type { RequestEntry, RequestStatus } from "../../store"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

import type { Filters } from "./filters"
import { STATUS_CONFIG } from "./constants"
import { hasActiveFilters, EMPTY_FILTERS } from "./filters"
import { FilterSelect } from "./filter-select"

// ── Filter Bar ──────────────────────────────────────────────────────────────

export function FilterBar({
  filters, setFilters, requests,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  requests: RequestEntry[]
}) {
  const availableMethods = [...new Set(requests.map((r) => r.httpMethod).filter(Boolean))] as string[]
  const availableSources = [...new Set(requests.map((r) => r.source))]
  const availableGroups = [...new Set(requests.map((r) => r.group).filter(Boolean))] as string[]

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
      <FilterSelect
        label="Status"
        options={["pending", "success", "error", "aborted", "validation_error"] as RequestStatus[]}
        selected={filters.status}
        onChange={(v) => setFilters({ ...filters, status: v })}
        renderOption={(o) => STATUS_CONFIG[o]?.label ?? o}
      />

      <FilterSelect
        label="Mode"
        options={["direct", "proxy"]}
        selected={filters.mode}
        onChange={(v) => setFilters({ ...filters, mode: v })}
      />

      <FilterSelect
        label="Type"
        options={["query", "mutation"]}
        selected={filters.type}
        onChange={(v) => setFilters({ ...filters, type: v })}
      />

      {availableSources.length > 1 && (
        <FilterSelect
          label="Source"
          options={availableSources}
          selected={filters.source}
          onChange={(v) => setFilters({ ...filters, source: v })}
        />
      )}

      {availableGroups.length > 1 && (
        <FilterSelect
          label="Group"
          options={availableGroups}
          selected={filters.group}
          onChange={(v) => setFilters({ ...filters, group: v })}
        />
      )}

      {availableMethods.length > 0 && (
        <FilterSelect
          label="Method"
          options={availableMethods}
          selected={filters.httpMethod}
          onChange={(v) => setFilters({ ...filters, httpMethod: v })}
        />
      )}

      <Separator orientation="vertical" className="mx-0.5 h-4" />

      {/* Min duration */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground">Min:</span>
        <Input
          type="number"
          placeholder="ms"
          value={filters.minDuration ?? ""}
          onChange={(e) =>
            setFilters({
              ...filters,
              minDuration: e.target.value ? Number(e.target.value) : null,
            })
          }
          className="h-6 w-16 px-1.5 text-[11px] tabular-nums"
        />
      </div>

      {/* Active filter badges */}
      <ActiveFilterBadges filters={filters} setFilters={setFilters} />

      {/* Clear all */}
      {hasActiveFilters(filters) && (
        <Button variant="ghost" size="xs" className="text-destructive" onClick={() => setFilters(EMPTY_FILTERS)}>
          <X className="size-3" />
          Reset
        </Button>
      )}
    </div>
  )
}

// ── Active Filter Badges ────────────────────────────────────────────────────

function ActiveFilterBadges({
  filters, setFilters,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
}) {
  const badges: Array<{ label: string; onRemove: () => void }> = []

  for (const status of filters.status) {
    badges.push({
      label: STATUS_CONFIG[status]?.label ?? status,
      onRemove: () => setFilters({ ...filters, status: filters.status.filter((s) => s !== status) }),
    })
  }
  for (const mode of filters.mode) {
    badges.push({
      label: mode,
      onRemove: () => setFilters({ ...filters, mode: filters.mode.filter((m) => m !== mode) }),
    })
  }
  for (const type of filters.type) {
    badges.push({
      label: type,
      onRemove: () => setFilters({ ...filters, type: filters.type.filter((t) => t !== type) }),
    })
  }

  if (badges.length === 0) return null

  return (
    <>
      <Separator orientation="vertical" className="mx-0.5 h-4" />
      {badges.map((b) => (
        <Badge key={b.label} variant="secondary" className="gap-1 text-[10px]">
          {b.label}
          <button type="button" onClick={b.onRemove} className="hover:text-foreground">
            <X className="size-2.5" />
          </button>
        </Badge>
      ))}
    </>
  )
}
