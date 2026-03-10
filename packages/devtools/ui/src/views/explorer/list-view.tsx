import { useState, useMemo } from "react"
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  Shield,
  Search,
} from "lucide-react"

import type { SourceMap } from "../../store"
import { Badge } from "../../components/ui"
import { flattenEndpoints, type FlatEndpoint } from "./helpers"

// ── Sort state ──────────────────────────────────────────────────────────────

type SortKey = "source" | "group" | "method" | "type" | "middleware" | "schemas"
type SortDir = "asc" | "desc"

function sortEndpoints(
  endpoints: FlatEndpoint[],
  key: SortKey,
  dir: SortDir,
): FlatEndpoint[] {
  const sorted = [...endpoints]
  const m = dir === "asc" ? 1 : -1

  sorted.sort((a, b) => {
    switch (key) {
      case "source":
        return a.source.localeCompare(b.source) * m
      case "group":
        return a.group.localeCompare(b.group) * m
      case "method":
        return a.method.localeCompare(b.method) * m
      case "type":
        return a.type.localeCompare(b.type) * m
      case "middleware":
        return (a.middleware.length - b.middleware.length) * m
      case "schemas": {
        const aCount = (a.hasVariablesSchema ? 1 : 0) + (a.hasResponseSchema ? 1 : 0)
        const bCount = (b.hasVariablesSchema ? 1 : 0) + (b.hasResponseSchema ? 1 : 0)
        return (aCount - bCount) * m
      }
      default:
        return 0
    }
  })

  return sorted
}

// ── Sort header ─────────────────────────────────────────────────────────────

function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className = "",
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: SortDir
  onSort: (key: SortKey) => void
  className?: string
}) {
  const isActive = currentKey === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-left text-[10px] font-semibold uppercase tracking-wider text-text-muted hover:text-text-secondary transition-colors ${className}`}
    >
      {label}
      {isActive ? (
        currentDir === "asc" ? (
          <ArrowUp size={10} />
        ) : (
          <ArrowDown size={10} />
        )
      ) : (
        <ArrowUpDown size={10} className="opacity-30" />
      )}
    </button>
  )
}

// ── List View Component ─────────────────────────────────────────────────────

export function ListView({
  sourceMap,
  onSelectEndpoint,
}: {
  sourceMap: SourceMap
  onSelectEndpoint: (ep: { source: string; group: string; method: string }) => void
}) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("source")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const allEndpoints = useMemo(() => flattenEndpoints(sourceMap), [sourceMap])

  const filtered = useMemo(() => {
    if (!search) return allEndpoints
    const q = search.toLowerCase()
    return allEndpoints.filter(
      (ep) =>
        ep.source.toLowerCase().includes(q) ||
        ep.group.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q) ||
        ep.prefix.toLowerCase().includes(q) ||
        ep.middleware.some((m) => m.toLowerCase().includes(q)),
    )
  }, [allEndpoints, search])

  const sorted = useMemo(() => sortEndpoints(filtered, sortKey, sortDir), [filtered, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
        <Search size={14} className="text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter endpoints..."
          className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
        />
        <span className="text-[10px] text-text-muted">
          {sorted.length} endpoint{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_1fr_1.5fr_80px_80px_100px] items-center gap-2 border-b border-border-default bg-surface-1 px-3 py-1.5">
        <SortHeader label="Source" sortKey="source" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortHeader label="Group" sortKey="group" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortHeader label="Method" sortKey="method" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortHeader label="Type" sortKey="type" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortHeader label="MW" sortKey="middleware" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortHeader label="Schemas" sortKey="schemas" currentKey={sortKey} currentDir={sortDir} onSort={handleSort} />
      </div>

      {/* Table body */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-text-muted">
            {search ? "No endpoints match your search" : "No endpoints available"}
          </div>
        ) : (
          sorted.map((ep) => (
            <button
              key={`${ep.source}.${ep.group}.${ep.method}`}
              type="button"
              onClick={() =>
                onSelectEndpoint({ source: ep.source, group: ep.group, method: ep.method })
              }
              className="grid w-full grid-cols-[1fr_1fr_1.5fr_80px_80px_100px] items-center gap-2 border-b border-border-subtle px-3 py-2 text-left transition-colors hover:bg-surface-1"
            >
              <span className="truncate text-xs text-indigo-400 font-medium">{ep.source}</span>
              <span className="truncate text-xs text-text-secondary">{ep.group}</span>
              <span className="truncate text-xs font-mono text-text-primary">{ep.method}</span>
              <div>
                <Badge variant={ep.type === "query" ? "emerald" : "orange"}>{ep.type}</Badge>
              </div>
              <div className="flex items-center gap-1">
                {ep.middleware.length > 0 ? (
                  <>
                    <Shield size={11} className="text-violet-400" />
                    <span className="text-[10px] text-text-muted">{ep.middleware.length}</span>
                  </>
                ) : (
                  <span className="text-[10px] text-text-muted">0</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5" title="Variables schema">
                  {ep.hasVariablesSchema ? (
                    <CheckCircle size={11} className="text-emerald-400" />
                  ) : (
                    <XCircle size={11} className="text-zinc-600" />
                  )}
                  <span className="text-[9px] text-text-muted">V</span>
                </div>
                <div className="flex items-center gap-0.5" title="Response schema">
                  {ep.hasResponseSchema ? (
                    <CheckCircle size={11} className="text-emerald-400" />
                  ) : (
                    <XCircle size={11} className="text-zinc-600" />
                  )}
                  <span className="text-[9px] text-text-muted">R</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
