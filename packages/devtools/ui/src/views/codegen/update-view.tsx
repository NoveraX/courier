import { ArrowLeft, CheckCircle, FileCode, Loader2, RefreshCw } from "lucide-react"

import type { UpdateContext } from "./types"
import { useUpdate } from "./use-update"
import { UpdateSummary } from "./update-summary"
import { BreakingChangeReport } from "./update-breaking"
import { UpdateDiffPreview } from "./update-diff"

export function UpdateView({ ctx, onBack }: { ctx: UpdateContext; onBack: () => void }) {
  const up = useUpdate(ctx)

  return (
    <div className="space-y-4">
      <UpdateHeader sourceName={ctx.sourceName} step={up.step} onBack={onBack} />

      {up.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {up.error}
        </div>
      )}

      {up.step === "summary" && (
        <>
          <UpdateSummary diff={ctx.diff} onPreview={up.loadPreview} />
          {ctx.diff.breakingChanges.length > 0 && <BreakingChangeReport changes={ctx.diff.breakingChanges} />}
        </>
      )}

      {up.step === "preview" && up.loading && <LoadingPreview />}

      {up.step === "preview" && up.preview && !up.loading && (
        <>
          <UpdateDiffPreview files={up.preview.files} activeIdx={up.activeFileIdx} onSelect={up.setActiveFileIdx} />
          <ApplyActions fileCount={up.preview.files.length} loading={up.loading} onApplyAll={up.applyAll} onCancel={onBack} />
        </>
      )}

      {up.step === "applied" && <AppliedConfirmation writtenCount={up.writtenCount} onDone={onBack} />}
    </div>
  )
}

function UpdateHeader({ sourceName, step, onBack }: {
  sourceName: string; step: string; onBack: () => void
}) {
  const stepLabel = { summary: "Changes Summary", preview: "File Preview", applied: "Applied" }[step] ?? step

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary">
        <ArrowLeft size={12} /> Back
      </button>
      <div className="h-4 w-px bg-border-subtle" />
      <RefreshCw size={14} className="text-indigo-400" />
      <span className="text-sm font-medium">Update: {sourceName}</span>
      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-muted">{stepLabel}</span>
    </div>
  )
}

function LoadingPreview() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 size={20} className="animate-spin text-text-muted" />
      <span className="ml-2 text-sm text-text-muted">Computing merge preview...</span>
    </div>
  )
}

function ApplyActions({ fileCount, loading, onApplyAll, onCancel }: {
  fileCount: number; loading: boolean; onApplyAll: () => void; onCancel: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border-default bg-surface-0 px-4 py-3">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <FileCode size={12} />
        <span>{fileCount} file{fileCount !== 1 ? "s" : ""} will be written</span>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onCancel} className="rounded px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-1 hover:text-text-secondary">
          Cancel
        </button>
        <button type="button" onClick={onApplyAll} disabled={loading} className="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-4 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-30">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          Apply All Changes
        </button>
      </div>
    </div>
  )
}

function AppliedConfirmation({ writtenCount, onDone }: { writtenCount: number; onDone: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <CheckCircle size={40} className="mb-4 text-emerald-400" />
      <h3 className="text-sm font-medium text-text-secondary">Update Applied Successfully</h3>
      <p className="mt-1 text-xs text-text-muted">
        {writtenCount} file{writtenCount !== 1 ? "s" : ""} written to disk. Registry fingerprints updated.
      </p>
      <button type="button" onClick={onDone} className="mt-4 rounded-lg bg-indigo-500/15 px-4 py-2 text-sm text-indigo-400 transition-colors hover:bg-indigo-500/25">
        Back to Registry
      </button>
    </div>
  )
}
