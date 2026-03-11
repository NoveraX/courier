import { useMemo, useCallback } from "react"
import {
  Network,
  ArrowLeftRight,
  ArrowDownUp,
  Info,
  X,
  Eye,
  EyeOff,
} from "lucide-react"

import { useDevToolsStore, type ExplorerView } from "../../store"
import { TabSwitcher } from "../../components/ui"
import { mergeSourceMaps, getDemoSourceMap } from "./helpers"
import { GraphView } from "./graph-view"
import { PipelineView } from "./pipeline-view"
import { ListView } from "./list-view"
import { EndpointSidebar } from "./endpoint-sidebar"

// ── Sub-view tabs ───────────────────────────────────────────────────────────

const VIEW_TABS: { id: ExplorerView; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "pipeline", label: "Pipeline" },
  { id: "list", label: "List" },
]

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
                {explorerSelectedEndpoint.group
                  ? `${explorerSelectedEndpoint.source}.${explorerSelectedEndpoint.group}.${explorerSelectedEndpoint.method}`
                  : `${explorerSelectedEndpoint.source}.${explorerSelectedEndpoint.method}`}
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
