import { useMemo, useCallback, useRef, useEffect } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Node,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Download } from "lucide-react"

import type { SourceMap, GraphLayout } from "../../store"
import { NODE_DELIM } from "./helpers"
import { graphNodeTypes } from "./graph-nodes"
import { buildGraph, buildAdjacency, getConnectedIds } from "./graph-builder"
import { exportGraphSvg } from "./export-svg"

function GraphInner({
  sourceMap,
  layout,
  showSchemas,
  onSelectEndpoint,
  onExportSvg,
}: {
  sourceMap: SourceMap
  layout: GraphLayout
  showSchemas: boolean
  onSelectEndpoint: (ep: { source: string; group: string; method: string }) => void
  onExportSvg: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const adjRef = useRef<Map<string, Set<string>>>(new Map())

  const { nodes, edges } = useMemo(
    () => buildGraph(sourceMap, layout, showSchemas),
    [sourceMap, layout, showSchemas]
  )

  useEffect(() => {
    adjRef.current = buildAdjacency(sourceMap)
  }, [sourceMap])

  const applyDimming = useCallback((connectedIds: Set<string> | null) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    for (const el of wrapper.querySelectorAll<HTMLElement>(".react-flow__node")) {
      const id = el.getAttribute("data-id")
      el.style.transition = "opacity 150ms"
      el.style.opacity = !connectedIds || !id ? "" : connectedIds.has(id) ? "" : "0.25"
    }

    for (const el of wrapper.querySelectorAll<HTMLElement>(".react-flow__edge")) {
      el.style.transition = "opacity 150ms"
      if (!connectedIds) {
        el.style.opacity = ""
      } else {
        const s = el.getAttribute("data-source")
        const t = el.getAttribute("data-target")
        el.style.opacity = s && t && connectedIds.has(s) && connectedIds.has(t) ? "" : "0.25"
      }
    }
  }, [])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id.startsWith("endpoint:")) {
        const parts = node.id.replace("endpoint:", "").split(NODE_DELIM)
        if (parts.length === 3) {
          onSelectEndpoint({ source: parts[0]!, group: parts[1]!, method: parts[2]! })
        }
      }
    },
    [onSelectEndpoint]
  )

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => applyDimming(getConnectedIds(adjRef.current, node.id)),
    [applyDimming]
  )

  const onNodeMouseLeave = useCallback(() => applyDimming(null), [applyDimming])

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodeTypes={graphNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="[&_.react-flow__background]:bg-transparent!"
      >
        <Background gap={20} size={1} color="rgba(63, 63, 70, 0.3)" />
        <Controls
          showInteractive={false}
          className="bg-surface-1! border-border-default! shadow-lg! [&_button]:bg-surface-2! [&_button]:border-border-default! [&_button]:text-text-muted! [&_button:hover]:bg-surface-3! [&_svg]:fill-text-muted!"
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "source") return "rgba(99, 102, 241, 0.6)"
            if (node.type === "group") return "rgba(161, 161, 170, 0.4)"
            return "rgba(52, 211, 153, 0.5)"
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
          className="bg-surface-1! border-border-default!"
        />
        <Panel position="top-right">
          <button
            type="button"
            onClick={onExportSvg}
            className="flex items-center gap-1.5 rounded bg-surface-1 border border-border-default px-2 py-1 text-[10px] text-text-muted hover:text-text-secondary hover:bg-surface-2 transition-colors shadow-sm"
            title="Export as SVG"
          >
            <Download size={12} />
            SVG
          </button>
        </Panel>
      </ReactFlow>
    </div>
  )
}

export function GraphView({
  sourceMap,
  layout,
  showSchemas,
  onSelectEndpoint,
}: {
  sourceMap: SourceMap
  layout: GraphLayout
  showSchemas: boolean
  onSelectEndpoint: (ep: { source: string; group: string; method: string }) => void
}) {
  const graphRef = useRef<HTMLDivElement>(null)

  const handleExportSvg = useCallback(() => {
    if (graphRef.current) exportGraphSvg(graphRef.current)
  }, [])

  return (
    <div ref={graphRef} className="h-full w-full" style={{ minHeight: 400 }}>
      <ReactFlowProvider>
        <GraphInner
          sourceMap={sourceMap}
          layout={layout}
          showSchemas={showSchemas}
          onSelectEndpoint={onSelectEndpoint}
          onExportSvg={handleExportSvg}
        />
      </ReactFlowProvider>
    </div>
  )
}
