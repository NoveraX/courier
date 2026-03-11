import { AlertTriangle, ChevronDown, ChevronRight, Info, Shield } from "lucide-react"
import { useState } from "react"

import type { BreakingChange, BreakingSeverity } from "./types"

const SEVERITY_CONFIG: Record<BreakingSeverity, { color: string; bg: string; border: string; label: string }> = {
  breaking: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: "Breaking" },
  "potentially-breaking": { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "Potentially Breaking" },
  "non-breaking": { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Non-Breaking" },
}

export function BreakingChangeReport({ changes }: { changes: BreakingChange[] }) {
  const grouped = groupBySeverity(changes)

  if (changes.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
        <Shield size={14} />
        <span>No breaking changes detected</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {(["breaking", "potentially-breaking", "non-breaking"] as BreakingSeverity[]).map((severity) => {
        const items = grouped[severity]
        if (!items || items.length === 0) return null
        return <SeverityGroup key={severity} severity={severity} items={items} />
      })}
    </div>
  )
}

function SeverityGroup({ severity, items }: { severity: BreakingSeverity; items: BreakingChange[] }) {
  const [expanded, setExpanded] = useState(severity === "breaking")
  const cfg = SEVERITY_CONFIG[severity]
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg}`}>
      <button type="button" onClick={() => setExpanded(!expanded)} className={`flex w-full items-center gap-2 px-3 py-2 text-xs font-medium ${cfg.color}`}>
        <Chevron size={12} />
        <SeverityIcon severity={severity} />
        {cfg.label} ({items.length})
      </button>
      {expanded && (
        <div className="border-t border-border-default px-3 pb-2">
          {items.map((item, i) => (
            <BreakingItem key={i} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

function SeverityIcon({ severity }: { severity: BreakingSeverity }) {
  if (severity === "breaking") return <AlertTriangle size={12} />
  if (severity === "potentially-breaking") return <Info size={12} />
  return <Shield size={12} />
}

function BreakingItem({ item }: { item: BreakingChange }) {
  return (
    <div className="flex items-start gap-2 border-b border-border-default py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-primary">{item.message}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted">
          <span className="rounded bg-surface-2 px-1.5 py-0.5">{item.category}</span>
          {item.endpoint && <span>Endpoint: {item.endpoint}</span>}
          {item.schema && <span>Schema: {item.schema}</span>}
        </div>
      </div>
    </div>
  )
}

function groupBySeverity(changes: BreakingChange[]): Partial<Record<BreakingSeverity, BreakingChange[]>> {
  const result: Partial<Record<BreakingSeverity, BreakingChange[]>> = {}
  for (const c of changes) {
    const arr = result[c.severity] ?? []
    arr.push(c)
    result[c.severity] = arr
  }
  return result
}
