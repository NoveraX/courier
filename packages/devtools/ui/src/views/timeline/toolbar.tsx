import { Search, X, Filter, Pause, Play, Trash2, BookmarkCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"

import type { Filters } from "./filters"
import { hasActiveFilters, countActiveFilters } from "./filters"

// Re-export FilterBar for backward compatibility
export { FilterBar } from "./filter-bar"

interface ToolbarProps {
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
}

export function Toolbar({
  filters, setFilters, showFilters, setShowFilters,
  paused, onTogglePause, preserveLog, onTogglePreserveLog,
  onClear, total, filtered,
}: ToolbarProps) {
  const active = hasActiveFilters(filters)

  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search requests..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="h-7 pl-7 pr-7 text-xs"
        />
        {filters.search && (
          <button
            type="button"
            onClick={() => setFilters({ ...filters, search: "" })}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </div>

      {/* Count */}
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] tabular-nums">
        {active ? `${filtered}/${total}` : total}
      </Badge>

      <Separator orientation="vertical" className="mx-0.5 h-4" />

      {/* Filter toggle */}
      <ToolbarButton
        tooltip={showFilters ? "Hide filters" : "Show filters"}
        kbd="⌘⇧F"
        active={showFilters || active}
        activeClassName="bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 hover:text-indigo-400"
        onClick={() => setShowFilters(!showFilters)}
      >
        <Filter className="size-3.5" />
        {active && (
          <span className="text-[10px] font-medium">{countActiveFilters(filters)}</span>
        )}
      </ToolbarButton>

      {/* Preserve log */}
      <ToolbarButton
        tooltip={preserveLog ? "Preserve log: ON" : "Preserve log: OFF"}
        active={preserveLog}
        activeClassName="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 hover:text-emerald-400"
        onClick={onTogglePreserveLog}
      >
        <BookmarkCheck className="size-3.5" />
      </ToolbarButton>

      {/* Pause / Resume */}
      <ToolbarButton
        tooltip={paused ? "Resume recording" : "Pause recording"}
        kbd="⌘P"
        active={paused}
        activeClassName="bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 hover:text-amber-400"
        onClick={onTogglePause}
      >
        {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
      </ToolbarButton>

      {/* Clear */}
      <ToolbarButton tooltip="Clear all" kbd="⌘E" onClick={onClear}>
        <Trash2 className="size-3.5" />
      </ToolbarButton>
    </div>
  )
}

// ── Toolbar Button with Tooltip + Kbd ────────────────────────────────────────

function ToolbarButton({
  tooltip, kbd, active, activeClassName, onClick, children,
}: {
  tooltip: string
  kbd?: string
  active?: boolean
  activeClassName?: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClick}
          className={active && activeClassName ? activeClassName : undefined}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        <span className="flex items-center gap-2">
          {tooltip}
          {kbd && <Kbd>{kbd}</Kbd>}
        </span>
      </TooltipContent>
    </Tooltip>
  )
}
