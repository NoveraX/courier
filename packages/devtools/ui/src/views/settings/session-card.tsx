import { useState } from "react"
import { Download, FileJson, Trash2 } from "lucide-react"

import { formatSize } from "../../components/ui"
import type { SessionSummary } from "./use-session-history"

// ── Session Card ───────────────────────────────────────────────────────────

export function SessionCard({
  session,
  onDelete,
  onExport,
}: {
  session: SessionSummary
  onDelete: () => void
  onExport: (id: string, format: string) => void
}) {
  const [showExport, setShowExport] = useState(false)

  const date = new Date(session.savedAt)
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  return (
    <div className="group rounded-md border border-border-subtle bg-surface-1 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-text-primary">{session.name}</p>
          <p className="text-[10px] text-text-muted">{dateStr}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Export"
            onClick={() => setShowExport(!showExport)}
            className="rounded p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-secondary"
          >
            <Download size={12} />
          </button>
          <button
            type="button"
            title="Delete"
            onClick={onDelete}
            className="rounded p-1 text-text-muted transition-colors hover:bg-red-500/15 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-1 flex gap-3 text-[10px] text-text-muted">
        <span>{session.stats.totalRequests} req</span>
        <span className="text-emerald-400">{session.stats.successCount} ok</span>
        {session.stats.errorCount > 0 && (
          <span className="text-red-400">{session.stats.errorCount} err</span>
        )}
        <span>{Math.round(session.stats.avgDuration)}ms avg</span>
        <span>{formatSize(session.stats.totalSize)}</span>
      </div>

      {/* Export dropdown */}
      {showExport && (
        <div className="mt-2 flex gap-2 border-t border-border-subtle pt-2">
          {(["har", "json", "postman"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onExport(session.id, fmt)}
              className="flex items-center gap-1 rounded-md border border-border-subtle px-2 py-1 text-[10px] text-text-secondary transition-colors hover:bg-surface-2"
            >
              <FileJson size={10} />
              {fmt === "har" ? "HAR" : fmt === "json" ? "JSON" : "Postman"}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
