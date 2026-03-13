import { AlertTriangle, ArrowRight, GitCommit, Minus, Pen, Plus } from "lucide-react"

import type { DiffEndpoint, SchemaDiff, SpecDiff } from "./types"

export function UpdateSummary({ diff, onPreview }: { diff: SpecDiff; onPreview: () => void }) {
  const totalChanges = diff.added.length + diff.removed.length + diff.modified.length
  const hasBreaking = diff.breakingChanges.length > 0

  return (
    <div className="space-y-4">
      <SummaryCards diff={diff} />

      {hasBreaking && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle size={14} />
          <span className="font-medium">{diff.breakingChanges.length} breaking change{diff.breakingChanges.length > 1 ? "s" : ""} detected</span>
        </div>
      )}

      {diff.added.length > 0 && <EndpointSection title="New Endpoints" icon={Plus} color="text-emerald-400" endpoints={diff.added} />}
      {diff.removed.length > 0 && <EndpointSection title="Removed Endpoints" icon={Minus} color="text-red-400" endpoints={diff.removed} />}
      {diff.modified.length > 0 && <EndpointSection title="Modified Endpoints" icon={Pen} color="text-amber-400" endpoints={diff.modified} />}
      {diff.schemaChanges.length > 0 && <SchemaSection changes={diff.schemaChanges} />}

      <div className="flex justify-end pt-2">
        <button type="button" onClick={onPreview} disabled={totalChanges === 0} className="flex items-center gap-1.5 rounded-lg bg-indigo-500/15 px-4 py-2 text-sm text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-30">
          Preview File Changes <ArrowRight size={14} />
        </button>
      </div>
    </div>
  )
}

function SummaryCards({ diff }: { diff: SpecDiff }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <CountCard count={diff.added.length} label="New" color="text-emerald-400" bg="bg-emerald-500/10" />
      <CountCard count={diff.removed.length} label="Removed" color="text-red-400" bg="bg-red-500/10" />
      <CountCard count={diff.modified.length} label="Modified" color="text-amber-400" bg="bg-amber-500/10" />
      <CountCard count={diff.schemaChanges.length} label="Schema Changes" color="text-sky-400" bg="bg-sky-500/10" />
    </div>
  )
}

function CountCard({ count, label, color, bg }: { count: number; label: string; color: string; bg: string }) {
  return (
    <div className={`rounded-lg ${bg} p-3 text-center`}>
      <div className={`text-2xl font-bold ${color}`}>{count}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}

function EndpointSection({ title, icon: Icon, color, endpoints }: {
  title: string; icon: typeof Plus; color: string; endpoints: DiffEndpoint[]
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-0 p-3">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${color}`}>
        <Icon size={12} />
        {title} ({endpoints.length})
      </div>
      <div className="space-y-1">
        {endpoints.map((ep) => (
          <EndpointRow key={`${ep.group}.${ep.name}`} ep={ep} />
        ))}
      </div>
    </div>
  )
}

function EndpointRow({ ep }: { ep: DiffEndpoint }) {
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-1">
      <span className="w-12 shrink-0 rounded bg-surface-2 px-1.5 py-0.5 text-center text-[10px] font-bold uppercase text-text-muted">{ep.method}</span>
      <span className="text-text-secondary">{ep.group}.</span>
      <span className="font-medium text-text-primary">{ep.name}</span>
      <span className="truncate text-text-muted">{ep.path}</span>
      {ep.changes && ep.changes.length > 0 && (
        <span className="ml-auto flex items-center gap-1 text-[10px] text-text-muted">
          <GitCommit size={9} /> {ep.changes.length} change{ep.changes.length > 1 ? "s" : ""}
        </span>
      )}
    </div>
  )
}

function SchemaSection({ changes }: { changes: SchemaDiff[] }) {
  const colorMap = { added: "text-emerald-400", removed: "text-red-400", modified: "text-amber-400" }

  return (
    <div className="rounded-lg border border-border-default bg-surface-0 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-sky-400">
        <GitCommit size={12} /> Schema Changes ({changes.length})
      </div>
      <div className="space-y-1">
        {changes.map((s) => (
          <div key={s.name} className="flex items-center gap-2 px-2 py-1 text-xs">
            <span className={`text-[10px] font-bold uppercase ${colorMap[s.type]}`}>{s.type}</span>
            <span className="font-medium text-text-primary">{s.name}</span>
            {s.changes && <span className="text-text-muted">— {s.changes.join(", ")}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
