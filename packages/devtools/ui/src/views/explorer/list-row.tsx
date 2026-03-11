import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  Shield,
} from "lucide-react"

import type { ListSortKey, ListSortDir } from "../../store"
import { Badge } from "../../components/ui"
import type { FlatEndpoint } from "./helpers"

export function SortHeader({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  className = "",
}: {
  label: string
  sortKey: ListSortKey
  currentKey: ListSortKey
  currentDir: ListSortDir
  onSort: (key: ListSortKey) => void
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
        currentDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
      ) : (
        <ArrowUpDown size={10} className="opacity-30" />
      )}
    </button>
  )
}

export function EndpointRow({
  ep,
  onSelect,
}: {
  ep: FlatEndpoint
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
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
  )
}
