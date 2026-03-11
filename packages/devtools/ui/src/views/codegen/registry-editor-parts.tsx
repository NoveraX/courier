import { AlertTriangle, Loader2, Search } from "lucide-react"

export function EditorToolbar({ totalSelected, totalEndpoints, search, onSearchChange, onSelectAll, onDeselectAll }: {
  totalSelected: number
  totalEndpoints: number
  search: string
  onSearchChange: (v: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Filter endpoints..."
          className="w-full rounded border border-border-default bg-surface-0 py-1 pl-7 pr-2 text-xs text-text-primary placeholder:text-text-muted focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <span className="shrink-0 text-xs text-text-muted">
        {totalSelected}/{totalEndpoints}
      </span>
      <button type="button" onClick={onSelectAll} className="shrink-0 text-[10px] text-indigo-400 hover:underline">All</button>
      <button type="button" onClick={onDeselectAll} className="shrink-0 text-[10px] text-text-muted hover:underline">None</button>
    </div>
  )
}

export function EditorActions({ applying, totalSelected, removedCount = 0, onApply, onClose }: {
  applying: boolean
  totalSelected: number
  removedCount?: number
  onApply: () => void
  onClose: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
      <button
        type="button"
        onClick={onApply}
        disabled={applying || totalSelected === 0}
        className="flex items-center gap-1.5 rounded bg-indigo-500/15 px-3 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-40"
      >
        {applying ? <Loader2 size={12} className="animate-spin" /> : null}
        {applying ? "Applying..." : removedCount > 0 ? `Apply (${totalSelected} endpoints, −${removedCount})` : `Apply (${totalSelected} endpoints)`}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="rounded px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary"
      >
        Cancel
      </button>
    </div>
  )
}

export function EditorLoading() {
  return (
    <div className="flex items-center gap-2 py-6 justify-center text-xs text-text-muted">
      <Loader2 size={14} className="animate-spin" />
      Loading spec...
    </div>
  )
}

export function EditorError({ error }: { error: string | null }) {
  return (
    <div className="py-4 text-center text-xs text-text-muted">
      {error ? <span className="text-red-400">{error}</span> : "No spec loaded"}
    </div>
  )
}

export function RemoveConfirmation({ removedCount, onConfirm, onCancel }: {
  removedCount: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
      <div className="flex-1 space-y-2">
        <p className="text-xs text-amber-300">
          {removedCount} endpoint{removedCount > 1 ? "s" : ""} will be permanently removed from generated code. This cannot be undone.
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onConfirm} className="rounded bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30">
            Confirm removal
          </button>
          <button type="button" onClick={onCancel} className="rounded px-2.5 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary">
            Go back
          </button>
        </div>
      </div>
    </div>
  )
}
