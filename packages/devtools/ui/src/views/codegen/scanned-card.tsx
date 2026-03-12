import { useState } from "react"
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Globe,
  Layers,
  PenTool,
  Shield,
  XCircle,
} from "lucide-react"

import { HTTP_METHOD_COLORS } from "../timeline/constants"
import type { ScannedSource, ScannedEndpoint, ScannedGroup } from "./types"

export function ScannedCard({ source }: { source: ScannedSource }) {
  const [expanded, setExpanded] = useState(false)
  const inlineCount = source.inlineEndpoints?.length ?? 0
  const totalEndpoints = source.groups.reduce((sum, g) => sum + g.endpoints.length, 0) + inlineCount

  return (
    <div className="rounded-lg border border-border-default bg-surface-0 p-4 transition-colors hover:border-border-subtle">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <PenTool size={16} className="text-emerald-400" />
          <span className="text-sm font-medium">{source.name}</span>
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-400">
            hand-written
          </span>
        </div>
        <AnalysisSummary source={source} />
      </div>

      <div className="mt-3 flex items-center gap-4 text-xs text-text-muted">
        <span className="flex items-center gap-1">
          <Layers size={10} /> {source.groups.length} groups
        </span>
        <span>{totalEndpoints} endpoints</span>
        {source.hasClient && (
          <span className="flex items-center gap-1 text-sky-400">
            <Code2 size={10} /> client
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
        <Globe size={10} />
        <span>{source.baseURL || "(no baseURL)"}</span>
        <span className="mx-1 text-border-subtle">·</span>
        <span className="text-text-secondary">{source.filePath}</span>
      </div>

      {totalEndpoints > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 flex items-center gap-1 border-t border-border-default pt-3 text-xs text-text-muted transition-colors hover:text-text-secondary"
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? "Hide" : "Show"} endpoint analysis
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-2">
          {source.inlineEndpoints && source.inlineEndpoints.length > 0 && (
            <GroupSection group={{ name: "(root)", prefix: "", filePath: source.filePath, endpoints: source.inlineEndpoints }} />
          )}
          {source.groups.map((group) => (
            <GroupSection key={group.name} group={group} />
          ))}
        </div>
      )}
    </div>
  )
}

function AnalysisSummary({ source }: { source: ScannedSource }) {
  const endpoints = [
    ...source.groups.flatMap((g) => g.endpoints),
    ...(source.inlineEndpoints ?? []),
  ]
  if (endpoints.length === 0) return null

  const typed = endpoints.filter((e) => e.analysis.hasResponseType).length
  const validated = endpoints.filter((e) => e.analysis.hasValidation).length
  const pct = Math.round((typed / endpoints.length) * 100)

  return (
    <div className="flex items-center gap-2 text-[10px] text-text-muted">
      <span className={pct === 100 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400"}>
        {pct}% typed
      </span>
      {validated > 0 && (
        <span className="flex items-center gap-0.5 text-sky-400">
          <Shield size={9} /> {validated}
        </span>
      )}
    </div>
  )
}

function GroupSection({ group }: { group: ScannedGroup }) {
  return (
    <div className="rounded border border-border-default bg-surface-1/50 p-2">
      <div className="mb-1.5 flex items-center gap-2 text-xs">
        <span className="font-medium text-text-secondary">{group.name}</span>
        {group.prefix && <span className="text-text-muted">{group.prefix}</span>}
        <span className="text-[10px] text-text-muted">{group.endpoints.length} endpoints</span>
      </div>
      <div className="space-y-0.5">
        {group.endpoints.map((ep) => (
          <EndpointRow key={ep.name} endpoint={ep} />
        ))}
      </div>
    </div>
  )
}

function EndpointRow({ endpoint }: { endpoint: ScannedEndpoint }) {
  const { analysis } = endpoint
  const method = analysis.httpMethod.toUpperCase()
  const methodColor = HTTP_METHOD_COLORS[method] ?? "text-text-muted"

  return (
    <div className="flex items-center gap-2 py-0.5 text-[11px]">
      <span className={`w-10 shrink-0 font-mono font-medium ${methodColor}`}>{method}</span>
      <span className="text-text-muted font-mono truncate max-w-[160px]">{analysis.path}</span>
      <span className="text-text-secondary">{endpoint.name}</span>
      <div className="ml-auto flex items-center gap-1">
        <Badge ok={analysis.hasResponseType} label="R" title="Response type" />
        <Badge ok={analysis.hasVariablesType} label="V" title="Variables type" />
        <Badge ok={analysis.hasValidation} label="S" title="Schema validation" />
      </div>
    </div>
  )
}

function Badge({ ok, label, title }: { ok: boolean; label: string; title: string }) {
  return (
    <span
      title={`${title}: ${ok ? "yes" : "no"}`}
      className={`flex items-center gap-0.5 rounded px-1 py-px text-[9px] ${
        ok ? "bg-emerald-500/15 text-emerald-400" : "bg-surface-2 text-text-muted"
      }`}
    >
      {ok ? <CheckCircle2 size={8} /> : <XCircle size={8} />}
      {label}
    </span>
  )
}
