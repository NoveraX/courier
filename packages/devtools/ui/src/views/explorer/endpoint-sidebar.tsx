import { Shield, CheckCircle, XCircle, X } from "lucide-react"

import type { SourceMap } from "../../store"
import { Badge } from "../../components/ui"

// ── Sidebar detail for selected endpoint ────────────────────────────────────

export function EndpointSidebar({
  sourceMap,
  selected,
  onClose,
}: {
  sourceMap: SourceMap
  selected: { source: string; group: string; method: string }
  onClose: () => void
}) {
  const source = sourceMap[selected.source]
  const group = source?.groups[selected.group]
  const ep = group?.endpoints[selected.method]

  if (!source || !group || !ep) return null

  const middleware = ep.middleware ?? []

  return (
    <div className="flex w-64 shrink-0 flex-col border-l border-border-default bg-surface-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-3 py-2">
        <span className="text-xs font-semibold text-text-primary">Endpoint Details</span>
        <button
          type="button"
          onClick={onClose}
          className="text-text-muted hover:text-text-secondary transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Identity */}
        <div>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Identity
          </h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Path</span>
              <span className="text-[11px] font-mono text-indigo-400">
                {selected.group ? `${selected.source}.${selected.group}.${selected.method}` : `${selected.source}.${selected.method}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">URL</span>
              <span className="text-[11px] font-mono text-text-secondary truncate ml-2">
                {source.baseURL}{group.prefix}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Type</span>
              <Badge variant={ep.type === "query" ? "emerald" : "orange"}>{ep.type}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">HTTP</span>
              <Badge variant={ep.type === "query" ? "sky" : "amber"}>
                {ep.type === "query" ? "GET" : "POST"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Schemas */}
        <div>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Validation
          </h4>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Variables schema</span>
              {ep.hasVariablesSchema ? (
                <div className="flex items-center gap-1">
                  <CheckCircle size={12} className="text-emerald-400" />
                  <span className="text-[10px] text-emerald-400">Defined</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <XCircle size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500">None</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">Response schema</span>
              {ep.hasResponseSchema ? (
                <div className="flex items-center gap-1">
                  <CheckCircle size={12} className="text-emerald-400" />
                  <span className="text-[10px] text-emerald-400">Defined</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <XCircle size={12} className="text-zinc-500" />
                  <span className="text-[10px] text-zinc-500">None</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Middleware */}
        <div>
          <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Middleware ({middleware.length})
          </h4>
          {middleware.length === 0 ? (
            <p className="text-[10px] text-text-muted italic">No middleware</p>
          ) : (
            <div className="space-y-1">
              {middleware.map((mw, i) => (
                <div
                  key={`${mw}-${i}`}
                  className="flex items-center gap-2 rounded bg-surface-1 px-2 py-1"
                >
                  <Shield size={10} className="text-violet-400 shrink-0" />
                  <span className="text-[11px] font-mono text-text-secondary">{mw}</span>
                  <span className="ml-auto text-[9px] text-text-muted">#{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
