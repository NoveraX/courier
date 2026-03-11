import { Clock, Trash2, RotateCcw } from "lucide-react"

import type { PlaygroundHistoryEntry } from "../../store"

import { formatDuration, formatAbsoluteTime } from "../../components/ui"

export function HistoryBar({
  history,
  activeId,
  onLoad,
  onClear,
}: {
  history: PlaygroundHistoryEntry[]
  activeId: string | undefined
  onLoad: (entry: PlaygroundHistoryEntry) => void
  onClear: () => void
}) {
  if (history.length === 0) return null

  return (
    <div className="border-t border-border-default bg-surface-0">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <Clock size={12} className="text-text-muted" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          History
        </span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-text-muted hover:text-text-secondary"
          title="Clear history"
        >
          <Trash2 size={11} />
        </button>
      </div>
      <div className="max-h-28 overflow-y-auto px-2 pb-2">
        {history.map((entry) => (
          <HistoryEntry
            key={entry.id}
            entry={entry}
            isActive={activeId === entry.id}
            onLoad={onLoad}
          />
        ))}
      </div>
    </div>
  )
}

function HistoryEntry({
  entry,
  isActive,
  onLoad,
}: {
  entry: PlaygroundHistoryEntry
  isActive: boolean
  onLoad: (entry: PlaygroundHistoryEntry) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onLoad(entry)}
      className={`group flex w-full items-center gap-2 rounded px-2 py-1 text-[11px] transition-colors hover:bg-surface-1 ${
        isActive ? "bg-surface-1" : ""
      }`}
    >
      <div
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          entry.status === "success"
            ? "bg-emerald-500"
            : entry.status === "error"
              ? "bg-red-500"
              : "bg-sky-500"
        }`}
      />
      <span className="text-text-muted">{formatAbsoluteTime(entry.timestamp)}</span>
      <span className="font-mono text-text-secondary">
        {entry.source}.{entry.group}.{entry.method}
      </span>
      {entry.statusCode != null && (
        <span
          className={`font-mono ${
            entry.statusCode < 300 ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {entry.statusCode}
        </span>
      )}
      {entry.duration != null && (
        <span className="text-text-muted">{formatDuration(entry.duration)}</span>
      )}
      <RotateCcw
        size={10}
        className="ml-auto shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  )
}
