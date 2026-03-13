import { AlertCircle, RefreshCw } from "lucide-react"

import type { SourceState } from "./types"

export function ErrorBanner({
  error,
  onDismiss,
}: {
  error: string
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-xs text-red-400">
      <AlertCircle size={14} />
      <span>{error}</span>
      <button type="button" onClick={onDismiss} className="ml-auto text-red-400/60 hover:text-red-400">Dismiss</button>
    </div>
  )
}

export function WatchDiffBanner({
  watchDiff,
  st,
  onReview,
  onDismiss,
}: {
  watchDiff: string
  st: SourceState
  onReview: () => void
  onDismiss: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-400">
      <RefreshCw size={14} />
      <span>{watchDiff}</span>
      {st.prevSpec && (
        <span className="text-text-muted">
          (was {st.prevSpec.groups.reduce((s, g) => s + g.endpoints.length, 0)} endpoints,
          now {st.spec?.groups.reduce((s, g) => s + g.endpoints.length, 0) ?? 0})
        </span>
      )}
      <button type="button" onClick={onReview} className="ml-auto rounded bg-amber-500/20 px-2 py-0.5 text-amber-300 hover:bg-amber-500/30">Review Changes</button>
      <button type="button" onClick={onDismiss} className="text-amber-400/60 hover:text-amber-400">Dismiss</button>
    </div>
  )
}
