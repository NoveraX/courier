import { Database, Loader2, Plus, RefreshCw } from "lucide-react"

import type { UpdateContext } from "./types"
import { RegistryCard } from "./registry-card"
import { useRegistry } from "./use-registry"

export function RegistryView({ onImportNew, onReviewUpdates }: {
  onImportNew: () => void
  onReviewUpdates: (ctx: UpdateContext) => void
}) {
  const reg = useRegistry()

  const handleCheckUpdates = async (name: string) => {
    const ctx = await reg.checkUpdates(name)
    if (ctx) onReviewUpdates(ctx)
  }

  if (reg.loading && reg.sources.length === 0) {
    return <LoadingState />
  }

  if (reg.sources.length === 0) {
    return <EmptyState onImportNew={onImportNew} />
  }

  return (
    <div className="space-y-4">
      <RegistryToolbar
        sourceCount={reg.sources.length}
        onCheckAll={reg.checkAll}
        onRefresh={reg.refresh}
        onImportNew={onImportNew}
      />

      {reg.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {reg.error}
        </div>
      )}

      <div className="grid gap-3">
        {reg.sources.map((source) => (
          <RegistryCard
            key={source.name}
            source={source}
            statusInfo={reg.statuses[source.name] ?? { status: "up-to-date" }}
            onCheckUpdates={() => handleCheckUpdates(source.name)}
            onRemove={() => reg.removeSource(source.name)}
          />
        ))}
      </div>
    </div>
  )
}

function RegistryToolbar({ sourceCount, onCheckAll, onRefresh, onImportNew }: {
  sourceCount: number; onCheckAll: () => void; onRefresh: () => void; onImportNew: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Database size={14} className="text-text-muted" />
        <span className="text-sm text-text-secondary">
          {sourceCount} {sourceCount === 1 ? "source" : "sources"} registered
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onCheckAll} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary">
          <RefreshCw size={12} /> Check All
        </button>
        <button type="button" onClick={onRefresh} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary">
          <RefreshCw size={12} /> Refresh
        </button>
        <button type="button" onClick={onImportNew} className="flex items-center gap-1 rounded bg-indigo-500/15 px-2.5 py-1 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/25">
          <Plus size={12} /> Import New API
        </button>
      </div>
    </div>
  )
}

function EmptyState({ onImportNew }: { onImportNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Database size={40} className="mb-4 text-text-muted opacity-40" />
      <h3 className="text-sm font-medium text-text-secondary">No API sources registered</h3>
      <p className="mt-1 max-w-sm text-xs text-text-muted">
        Import an OpenAPI spec to generate type-safe API clients. Your sources will appear here with sync status and quick actions.
      </p>
      <button type="button" onClick={onImportNew} className="mt-4 flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-4 py-2 text-sm text-indigo-400 transition-colors hover:bg-indigo-500/25">
        <Plus size={14} /> Import Your First API
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={20} className="animate-spin text-text-muted" />
      <span className="ml-2 text-sm text-text-muted">Loading registry...</span>
    </div>
  )
}
