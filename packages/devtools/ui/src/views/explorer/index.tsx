import { useMemo, useCallback } from "react"
import {
  Network,
  ArrowLeftRight,
  ArrowDownUp,
  Info,
  Shield,
  CheckCircle,
  XCircle,
  X,
  Eye,
  EyeOff,
} from "lucide-react"

import { useDevToolsStore, type ExplorerView, type SourceMap } from "../../store"
import { Badge, TabSwitcher } from "../../components/ui"
import { mergeSourceMaps, getDemoSourceMap } from "./helpers"
import { GraphView } from "./graph-view"
import { PipelineView } from "./pipeline-view"
import { ListView } from "./list-view"

// ── Sub-view tabs ───────────────────────────────────────────────────────────

const VIEW_TABS: { id: ExplorerView; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "pipeline", label: "Pipeline" },
  { id: "list", label: "List" },
]

// ── Sidebar detail for selected endpoint ────────────────────────────────────

function EndpointSidebar({
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
                {selected.source}.{selected.group}.{selected.method}
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

// ── Explorer View ───────────────────────────────────────────────────────────

export function ExplorerView() {
  const {
    sessions,
    requests,
    explorerView,
    setExplorerView,
    explorerSelectedEndpoint,
    setExplorerSelectedEndpoint,
    graphLayout,
    setGraphLayout,
    showSchemas,
    setShowSchemas,
  } = useDevToolsStore()

  // Merge source maps from all connected sessions, or use demo
  const { sourceMap, isDemo } = useMemo(() => {
    const merged = mergeSourceMaps(sessions)
    const empty = Object.keys(merged).length === 0
    return {
      sourceMap: empty ? getDemoSourceMap() : merged,
      isDemo: empty,
    }
  }, [sessions])

  const handleSelectEndpoint = useCallback(
    (ep: { source: string; group: string; method: string }) => {
      setExplorerSelectedEndpoint(ep)
    },
    [setExplorerSelectedEndpoint],
  )

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border-default bg-surface-0 px-3 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Network size={14} className="text-text-muted" />
            <span className="text-xs font-medium text-text-primary">API Explorer</span>
          </div>

          <TabSwitcher tabs={VIEW_TABS} active={explorerView} onChange={setExplorerView} />

          {isDemo && (
            <div className="flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5">
              <Info size={10} className="text-amber-400" />
              <span className="text-[10px] text-amber-400">Demo data — connect an app to see your API</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Graph-specific controls */}
          {explorerView === "graph" && (
            <>
              {/* Schema indicators toggle */}
              <button
                type="button"
                onClick={() => setShowSchemas(!showSchemas)}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors ${
                  showSchemas
                    ? "bg-emerald-500/10 text-emerald-400"
                    : "bg-surface-1 text-text-muted hover:text-text-secondary"
                }`}
                title={showSchemas ? "Hide schema indicators" : "Show schema indicators"}
              >
                {showSchemas ? <Eye size={12} /> : <EyeOff size={12} />}
                Schemas
              </button>

              {/* Layout toggle */}
              <button
                type="button"
                onClick={() => setGraphLayout(graphLayout === "LR" ? "TB" : "LR")}
                className="flex items-center gap-1 rounded bg-surface-1 px-2 py-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors"
                title={`Layout: ${graphLayout === "LR" ? "Left to Right" : "Top to Bottom"}`}
              >
                {graphLayout === "LR" ? (
                  <ArrowLeftRight size={12} />
                ) : (
                  <ArrowDownUp size={12} />
                )}
                {graphLayout}
              </button>
            </>
          )}

          {/* Selected endpoint indicator */}
          {explorerSelectedEndpoint && (
            <div className="flex items-center gap-1.5 rounded bg-surface-1 px-2 py-1">
              <span className="text-[10px] font-mono text-indigo-400">
                {explorerSelectedEndpoint.source}.{explorerSelectedEndpoint.group}.
                {explorerSelectedEndpoint.method}
              </span>
              <button
                type="button"
                onClick={() => setExplorerSelectedEndpoint(null)}
                className="text-text-muted hover:text-text-secondary"
              >
                <X size={10} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {explorerView === "graph" && (
            <GraphView
              sourceMap={sourceMap}
              layout={graphLayout}
              showSchemas={showSchemas}
              onSelectEndpoint={handleSelectEndpoint}
            />
          )}
          {explorerView === "pipeline" && (
            <PipelineView
              sourceMap={sourceMap}
              selected={explorerSelectedEndpoint}
              requests={requests}
              onSelectEndpoint={handleSelectEndpoint}
            />
          )}
          {explorerView === "list" && (
            <ListView sourceMap={sourceMap} onSelectEndpoint={handleSelectEndpoint} />
          )}
        </div>

        {/* Sidebar */}
        {explorerSelectedEndpoint && (
          <EndpointSidebar
            sourceMap={sourceMap}
            selected={explorerSelectedEndpoint}
            onClose={() => setExplorerSelectedEndpoint(null)}
          />
        )}
      </div>
    </div>
  )
}
