import { useState } from "react"

import type { SourceSummary } from "./types"
import { EndpointTree } from "./endpoint-tree"
import { EditorActions, EditorError, EditorLoading, EditorToolbar, RemoveConfirmation } from "./registry-editor-parts"
import { useEndpointEditor } from "./use-endpoint-editor"

export function RegistryEndpointEditor({ source, onClose, onApplied }: {
  source: SourceSummary
  onClose: () => void
  onApplied: () => void
}) {
  const ed = useEndpointEditor(source, onApplied)
  const [confirming, setConfirming] = useState(false)

  if (ed.loading) return <EditorLoading />
  if (!ed.spec) return <EditorError error={ed.error} />

  const onApply = () => {
    if (ed.removedCount > 0) { setConfirming(true); return }
    ed.handleApply()
  }

  return (
    <div className="mt-3 space-y-3 border-t border-border-default pt-3">
      <EditorToolbar
        totalSelected={ed.totalSelected}
        totalEndpoints={ed.totalEndpoints}
        search={ed.search}
        onSearchChange={ed.setSearch}
        onSelectAll={ed.selectAll}
        onDeselectAll={ed.deselectAll}
      />

      <div className="max-h-[400px] overflow-y-auto rounded-lg">
        <EndpointTree
          filteredGroups={ed.filteredGroups}
          allGroups={ed.spec.groups}
          groupKeys={ed.groupKeys}
          selection={ed.selection}
          expandedGroups={ed.expandedGroups}
          search={ed.search}
          onToggleExpand={ed.toggleExpand}
          onToggleGroup={ed.toggleGroup}
          onToggleEndpoint={ed.toggleEndpoint}
        />
      </div>

      {confirming && (
        <RemoveConfirmation
          removedCount={ed.removedCount}
          onConfirm={() => { setConfirming(false); ed.handleApply() }}
          onCancel={() => setConfirming(false)}
        />
      )}

      {ed.error && <p className="text-xs text-red-400">{ed.error}</p>}
      {ed.result && <p className="text-xs text-emerald-400">{ed.result}</p>}

      <EditorActions
        applying={ed.applying}
        totalSelected={ed.totalSelected}
        removedCount={ed.removedCount}
        onApply={onApply}
        onClose={onClose}
      />
    </div>
  )
}
