import { useMemo, useCallback } from "react"
import { Search } from "lucide-react"

import type { SourceMap, ListSortKey } from "../../store"
import { useDevToolsStore } from "../../store"
import { flattenEndpoints } from "./helpers"
import { sortEndpoints } from "./list-sort"
import { SortHeader, EndpointRow } from "./list-row"

export function ListView({
  sourceMap,
  onSelectEndpoint,
}: {
  sourceMap: SourceMap
  onSelectEndpoint: (ep: { source: string; group: string; method: string }) => void
}) {
  const { listSearch, setListSearch, listSortKey, setListSortKey, listSortDir, setListSortDir } =
    useDevToolsStore()

  const allEndpoints = useMemo(() => flattenEndpoints(sourceMap), [sourceMap])

  const filtered = useMemo(() => {
    if (!listSearch) return allEndpoints
    const q = listSearch.toLowerCase()
    return allEndpoints.filter(
      (ep) =>
        ep.source.toLowerCase().includes(q) ||
        ep.group.toLowerCase().includes(q) ||
        ep.method.toLowerCase().includes(q) ||
        ep.prefix.toLowerCase().includes(q) ||
        ep.middleware.some((m) => m.toLowerCase().includes(q))
    )
  }, [allEndpoints, listSearch])

  const sorted = useMemo(() => sortEndpoints(filtered, listSortKey, listSortDir), [filtered, listSortKey, listSortDir])

  const handleSort = useCallback(
    (key: ListSortKey) => {
      if (key === listSortKey) {
        setListSortDir(listSortDir === "asc" ? "desc" : "asc")
      } else {
        setListSortKey(key)
        setListSortDir("asc")
      }
    },
    [listSortKey, listSortDir, setListSortKey, setListSortDir]
  )

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-border-default px-3 py-2">
        <Search size={14} className="text-text-muted" />
        <input
          type="text"
          value={listSearch}
          onChange={(e) => setListSearch(e.target.value)}
          placeholder="Filter endpoints..."
          className="flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
        />
        <span className="text-[10px] text-text-muted">
          {sorted.length} endpoint{sorted.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_1fr_1.5fr_80px_80px_100px] items-center gap-2 border-b border-border-default bg-surface-1 px-3 py-1.5">
        <SortHeader label="Source" sortKey="source" currentKey={listSortKey} currentDir={listSortDir} onSort={handleSort} />
        <SortHeader label="Group" sortKey="group" currentKey={listSortKey} currentDir={listSortDir} onSort={handleSort} />
        <SortHeader label="Method" sortKey="method" currentKey={listSortKey} currentDir={listSortDir} onSort={handleSort} />
        <SortHeader label="Type" sortKey="type" currentKey={listSortKey} currentDir={listSortDir} onSort={handleSort} />
        <SortHeader label="MW" sortKey="middleware" currentKey={listSortKey} currentDir={listSortDir} onSort={handleSort} />
        <SortHeader label="Schemas" sortKey="schemas" currentKey={listSortKey} currentDir={listSortDir} onSort={handleSort} />
      </div>

      {/* Table body */}
      <div className="flex-1 overflow-y-auto">
        {sorted.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-xs text-text-muted">
            {listSearch ? "No endpoints match your search" : "No endpoints available"}
          </div>
        ) : (
          sorted.map((ep) => (
            <EndpointRow
              key={`${ep.source}.${ep.group}.${ep.method}`}
              ep={ep}
              onSelect={() => onSelectEndpoint({ source: ep.source, group: ep.group, method: ep.method })}
            />
          ))
        )}
      </div>
    </div>
  )
}
