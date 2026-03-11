import { Check, List, Loader2, RefreshCw } from "lucide-react"

import type { GenerateOptions } from "./types"

const VALIDATION_ITEMS = [
  { id: "zod", label: "Zod" }, { id: "valibot", label: "Valibot" },
  { id: "arktype", label: "ArkType" }, { id: "none", label: "None" },
]
const GROUP_BY_ITEMS = [
  { id: "tag", label: "Tag" }, { id: "path", label: "Path" }, { id: "single", label: "Single" },
]
const CLIENT_ITEMS = [
  { id: "both", label: "Direct+Proxy" }, { id: "direct", label: "Direct" },
  { id: "proxy", label: "Proxy" }, { id: "none", label: "None" },
]

export function OptionsGrid({ opts, onChange }: { opts: GenerateOptions; onChange: (o: GenerateOptions) => void }) {
  return (
    <div className="space-y-2.5">
      <MiniRadio label="Validation" value={opts.validation} items={VALIDATION_ITEMS} onChange={(v) => onChange({ ...opts, validation: v as GenerateOptions["validation"] })} />
      <MiniRadio label="Group By" value={opts.groupBy} items={GROUP_BY_ITEMS} onChange={(v) => onChange({ ...opts, groupBy: v as GenerateOptions["groupBy"] })} />
      <MiniRadio label="Client" value={opts.generateClient} items={CLIENT_ITEMS} onChange={(v) => onChange({ ...opts, generateClient: v as GenerateOptions["generateClient"] })} />
    </div>
  )
}

function MiniRadio({ label, value, items, onChange }: {
  label: string; value: string; items: { id: string; label: string }[]; onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[11px] text-text-muted">{label}</span>
      <div className="flex gap-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
              value === item.id
                ? "bg-indigo-500/15 text-indigo-400"
                : "bg-surface-1 text-text-muted hover:text-text-secondary"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TogglesRow({ opts, onChange }: { opts: GenerateOptions; onChange: (o: GenerateOptions) => void }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <ToggleBadge label="Types" enabled={opts.generateTypes} onClick={() => onChange({ ...opts, generateTypes: !opts.generateTypes })} />
      <ToggleBadge label="Schemas" enabled={opts.generateSchemas} onClick={() => onChange({ ...opts, generateSchemas: !opts.generateSchemas })} />
      <ToggleBadge label="Auth" enabled={opts.addAuthMiddleware} onClick={() => onChange({ ...opts, addAuthMiddleware: !opts.addAuthMiddleware })} />
      <ToggleBadge label="Comments" enabled={opts.includeComments} onClick={() => onChange({ ...opts, includeComments: !opts.includeComments })} />
    </div>
  )
}

function ToggleBadge({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors ${
        enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-surface-1 text-text-muted line-through"
      }`}
    >
      {enabled && <Check size={9} />}
      {label}
    </button>
  )
}

export function SelectedEndpoints({ opts }: { opts: GenerateOptions }) {
  if (!opts.selectedEndpoints) return null
  const groups = Object.entries(opts.selectedEndpoints)
  if (groups.length === 0) return null
  const total = groups.reduce((sum, [, eps]) => sum + eps.length, 0)

  return (
    <span className="text-xs text-text-muted">{total} endpoints across {groups.length} groups</span>
  )
}

export function SettingsActions({ loading, isDirty, isRaw, onApply, onEditEndpoints }: {
  loading: boolean; isDirty: boolean; isRaw: boolean
  onApply: () => void; onEditEndpoints: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-t border-border-subtle pt-3">
      <button
        type="button"
        onClick={onEditEndpoints}
        disabled={isRaw}
        className="flex items-center gap-1.5 rounded bg-indigo-500/15 px-3 py-1.5 text-xs text-indigo-400 transition-colors hover:bg-indigo-500/25 disabled:opacity-40"
      >
        <List size={12} />
        Edit Endpoints
      </button>
      <button
        type="button"
        onClick={onApply}
        disabled={loading || isRaw}
        className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
          isDirty
            ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
            : "bg-surface-1 text-text-muted hover:bg-surface-2 hover:text-text-secondary"
        }`}
      >
        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
        {loading ? "Applying..." : isDirty ? "Apply Changes" : "Re-generate"}
      </button>
      {isRaw && <span className="text-[10px] text-text-muted">Not available for raw sources</span>}
    </div>
  )
}
