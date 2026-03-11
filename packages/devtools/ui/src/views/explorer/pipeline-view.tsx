import { useMemo } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
} from "@xyflow/react"
import { ArrowRight, ChevronDown } from "lucide-react"

import type { SourceMap, RequestEntry } from "../../store"
import { flattenEndpoints } from "./helpers"
import { pipelineNodeTypes } from "./pipeline-nodes"
import { buildPipeline } from "./pipeline-builder"

// ── Endpoint picker for Pipeline view ───────────────────────────────────────

function EndpointPicker({
  sourceMap,
  onSelect,
}: {
  sourceMap: SourceMap
  onSelect: (ep: { source: string; group: string; method: string }) => void
}) {
  const endpoints = useMemo(() => flattenEndpoints(sourceMap), [sourceMap])

  if (endpoints.length === 0) return null

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-text-muted">
      <ArrowRight size={32} strokeWidth={1} />
      <p className="text-xs">Select an endpoint to visualize its middleware pipeline</p>
      <div className="relative w-64">
        <select
          className="w-full appearance-none rounded border border-border-default bg-surface-1 px-3 py-2 pr-8 text-xs text-text-primary outline-none focus:border-indigo-500/50"
          defaultValue=""
          onChange={(e) => {
            const val = e.target.value
            if (!val) return
            const [source, group, method] = val.split("::")
            if (source && group && method) {
              onSelect({ source, group, method })
            }
          }}
        >
          <option value="" disabled>Choose endpoint...</option>
          {endpoints.map((ep) => (
            <option
              key={`${ep.source}::${ep.group}::${ep.method}`}
              value={`${ep.source}::${ep.group}::${ep.method}`}
            >
              {ep.source}.{ep.group}.{ep.method} ({ep.type})
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
      </div>
    </div>
  )
}

// ── Pipeline View Component ─────────────────────────────────────────────────

export function PipelineView({
  sourceMap,
  selected,
  requests,
  onSelectEndpoint,
}: {
  sourceMap: SourceMap
  selected: { source: string; group: string; method: string } | null
  requests: RequestEntry[]
  onSelectEndpoint: (ep: { source: string; group: string; method: string }) => void
}) {
  const selectedKey = selected ? `${selected.source}::${selected.group}::${selected.method}` : null

  const relevantRequestsCount = useMemo(() => {
    if (!selected) return 0
    return requests.filter(
      (r) => r.source === selected.source && r.group === selected.group && r.method === selected.method && r.status !== "pending",
    ).length
  }, [requests, selected])

  const graph = useMemo(
    () => (selected ? buildPipeline(sourceMap, selected, requests) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceMap, selectedKey, relevantRequestsCount],
  )

  if (!selected || !graph) {
    return <EndpointPicker sourceMap={sourceMap} onSelect={onSelectEndpoint} />
  }

  return (
    <div className="h-full w-full" style={{ minHeight: 300 }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={pipelineNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.5}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag
          zoomOnScroll
          className="[&_.react-flow__background]:!bg-transparent"
        >
          <Background gap={20} size={1} color="rgba(63, 63, 70, 0.3)" />
          <Controls
            showInteractive={false}
            className="!bg-surface-1 !border-border-default !shadow-lg [&_button]:!bg-surface-2 [&_button]:!border-border-default [&_button]:!text-text-muted [&_button:hover]:!bg-surface-3 [&_svg]:!fill-text-muted"
          />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}
