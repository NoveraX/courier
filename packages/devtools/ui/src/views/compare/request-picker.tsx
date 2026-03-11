import type { RequestEntry } from "../../store"
import { formatDuration } from "../../components/ui"
import { STATUS_CONFIG, HTTP_METHOD_COLORS } from "../timeline/constants"

export function RequestPicker({
  requests,
  onSelect,
  selectedIds,
}: {
  requests: RequestEntry[]
  onSelect: (id: string) => void
  selectedIds: string[]
}) {
  return (
    <div className="max-h-64 flex-1 overflow-y-auto border-b border-border-default">
      {requests.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-[11px] text-text-muted">No completed requests</div>
      ) : (
        requests.map((r) => {
          const label = [r.source, r.group, r.method].filter(Boolean).join(".")
          const isSelected = selectedIds.includes(r.id)
          const statusCfg = STATUS_CONFIG[r.status]
          const methodColor = HTTP_METHOD_COLORS[r.httpMethod ?? "GET"] ?? "text-text-secondary"
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={`flex w-full items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-left transition-colors hover:bg-surface-1 ${isSelected ? "bg-surface-1 opacity-50" : ""}`}
              disabled={isSelected}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
              <span className={`text-[10px] font-medium ${methodColor}`}>{r.httpMethod ?? "GET"}</span>
              <span className="flex-1 truncate font-mono text-[11px] text-text-secondary">{label}</span>
              <span className="text-[10px] text-text-muted">{r.statusCode ?? "\u2014"}</span>
              <span className="text-[10px] text-text-muted">{r.timing ? formatDuration(r.timing.total) : "\u2014"}</span>
            </button>
          )
        })
      )}
    </div>
  )
}
