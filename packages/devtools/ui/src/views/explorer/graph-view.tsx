import { useMemo, useCallback, useRef, useEffect } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { Database, Folder, Zap, Shield, CheckCircle, XCircle, Download } from "lucide-react"

import type { SourceMap, GraphLayout } from "../../store"
import { Badge } from "../../components/ui"

// ── Custom node components ──────────────────────────────────────────────────

function SourceNode({
  data,
}: {
  data: { label: string; baseURL: string; groupCount: number }
}) {
  return (
    <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 shadow-lg backdrop-blur-sm">

      <Handle type="source" position={Position.Right} className="!bg-indigo-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Database size={14} className="text-indigo-400" />
        <span className="text-xs font-semibold text-indigo-300">{data.label}</span>
      </div>
      <div className="mt-1 text-[10px] text-text-muted">{data.baseURL}</div>
      <div className="mt-1 text-[10px] text-text-muted">{data.groupCount} groups</div>
    </div>
  )
}

function GroupNode({
  data,
}: {
  data: { label: string; prefix: string; endpointCount: number }
}) {
  return (
    <div className="rounded-lg border border-zinc-600/50 bg-surface-2 px-4 py-3 shadow-lg">

      <Handle type="target" position={Position.Left} className="!bg-zinc-400 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-zinc-400 !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Folder size={14} className="text-zinc-400" />
        <span className="text-xs font-semibold text-text-primary">{data.label}</span>
      </div>
      <div className="mt-1 text-[10px] text-text-muted">{data.prefix}</div>
      <div className="mt-1 text-[10px] text-text-muted">{data.endpointCount} endpoints</div>
    </div>
  )
}

const HTTP_METHOD_MAP: Record<string, string> = {
  query: "GET",
  mutation: "POST",
}

function EndpointNode({
  data,
}: {
  data: {
    label: string
    type: "query" | "mutation"
    hasVariablesSchema: boolean
    hasResponseSchema: boolean
    middleware: string[]
    source: string
    group: string
    showSchemas: boolean
  }
}) {
  const isQuery = data.type === "query"

  return (
    <div
      className={`rounded-lg border px-3 py-2 shadow-lg ${
        isQuery
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-orange-500/30 bg-orange-500/10"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={`!w-2 !h-2 ${isQuery ? "!bg-emerald-400" : "!bg-orange-400"}`}
      />
      <div className="flex items-center gap-2">
        <Zap size={12} className={isQuery ? "text-emerald-400" : "text-orange-400"} />
        <span className="text-xs font-medium text-text-primary">{data.label}</span>
        <Badge variant={isQuery ? "emerald" : "orange"}>
          {HTTP_METHOD_MAP[data.type] ?? data.type}
        </Badge>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {data.middleware && data.middleware.length > 0 && (
          <div className="flex items-center gap-0.5">
            <Shield size={10} className="text-text-muted" />
            <span className="text-[9px] text-text-muted">{data.middleware.length}</span>
          </div>
        )}
        {data.showSchemas && (
          <>
            <div className="flex items-center gap-0.5" title="Variables schema">
              {data.hasVariablesSchema ? (
                <CheckCircle size={10} className="text-emerald-400" />
              ) : (
                <XCircle size={10} className="text-zinc-600" />
              )}
              <span className="text-[9px] text-text-muted">V</span>
            </div>
            <div className="flex items-center gap-0.5" title="Response schema">
              {data.hasResponseSchema ? (
                <CheckCircle size={10} className="text-emerald-400" />
              ) : (
                <XCircle size={10} className="text-zinc-600" />
              )}
              <span className="text-[9px] text-text-muted">R</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  source: SourceNode,
  group: GroupNode,
  endpoint: EndpointNode,
}

// ── Build nodes & edges from SourceMap ──────────────────────────────────────

/** Build adjacency map for hover highlight flood-fill */
function buildAdjacency(sourceMap: SourceMap) {
  const adj = new Map<string, Set<string>>()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    for (const [groupName, group] of Object.entries(source.groups)) {
      addEdge(`source:${sourceName}`, `group:${sourceName}.${groupName}`)
      for (const methodName of Object.keys(group.endpoints)) {
        addEdge(
          `group:${sourceName}.${groupName}`,
          `endpoint:${sourceName}.${groupName}.${methodName}`,
        )
      }
    }
  }
  return adj
}

/** BFS from a node to find all connected IDs */
function getConnectedIds(adj: Map<string, Set<string>>, startId: string): Set<string> {
  const visited = new Set<string>([startId])
  const queue = [startId]
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return visited
}

function buildGraph(
  sourceMap: SourceMap,
  layout: GraphLayout,
  showSchemas: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const isLR = layout === "LR"
  const colGap = isLR ? 280 : 0
  const rowGap = isLR ? 0 : 200

  let sourceIdx = 0
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    const groupNames = Object.keys(source.groups)
    const totalEndpoints = groupNames.reduce(
      (acc, g) => acc + Object.keys(source.groups[g]!.endpoints).length,
      0,
    )

    const sourceY = isLR ? sourceIdx * (totalEndpoints * 52 + 80) : 0
    const sourceX = isLR ? 0 : sourceIdx * 400
    const sourceId = `source:${sourceName}`

    nodes.push({
      id: sourceId,
      type: "source",
      position: { x: sourceX, y: sourceY },
      data: {
        label: sourceName,
        baseURL: source.baseURL,
        groupCount: groupNames.length,
      },
    })

    let endpointOffset = 0

    for (const [groupName, group] of Object.entries(source.groups)) {
      const endpointNames = Object.keys(group.endpoints)
      const groupId = `group:${sourceName}.${groupName}`

      const gx = isLR ? sourceX + colGap : sourceX + endpointOffset * 180
      const gy = isLR ? sourceY + endpointOffset * 52 : sourceY + rowGap

      nodes.push({
        id: groupId,
        type: "group",
        position: { x: gx, y: gy },
        data: {
          label: groupName,
          prefix: group.prefix,
          endpointCount: endpointNames.length,
        },
      })

      edges.push({
        id: `e:${sourceName}->${groupName}`,
        source: sourceId,
        target: groupId,
        type: "smoothstep",
        animated: true,
        style: {
          stroke: "rgba(99, 102, 241, 0.4)",
          strokeWidth: 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: "rgba(99, 102, 241, 0.5)",
        },
      })

      for (let i = 0; i < endpointNames.length; i++) {
        const methodName = endpointNames[i]!
        const ep = group.endpoints[methodName]!
        const epId = `endpoint:${sourceName}.${groupName}.${methodName}`

        const ex = isLR ? gx + colGap : gx + i * 180
        const ey = isLR ? gy + i * 52 : gy + rowGap

        nodes.push({
          id: epId,
          type: "endpoint",
          position: { x: ex, y: ey },
          data: {
            label: methodName,
            type: ep.type,
            hasVariablesSchema: ep.hasVariablesSchema,
            hasResponseSchema: ep.hasResponseSchema,
            middleware: ep.middleware ?? [],
            source: sourceName,
            group: groupName,
            showSchemas,
          },
        })

        edges.push({
          id: `e:${sourceName}.${groupName}->${methodName}`,
          source: groupId,
          target: epId,
          type: "smoothstep",
          style: {
            stroke:
              ep.type === "query"
                ? "rgba(52, 211, 153, 0.4)"
                : "rgba(251, 146, 60, 0.4)",
            strokeWidth: 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color:
              ep.type === "query"
                ? "rgba(52, 211, 153, 0.5)"
                : "rgba(251, 146, 60, 0.5)",
          },
        })
      }

      endpointOffset += endpointNames.length
    }

    sourceIdx++
  }

  return { nodes, edges }
}

// ── Inner graph (needs ReactFlowProvider) ───────────────────────────────────

function GraphInner({
  sourceMap,
  layout,
  showSchemas,
  onSelectEndpoint,
  onExportPng,
}: {
  sourceMap: SourceMap
  layout: GraphLayout
  showSchemas: boolean
  onSelectEndpoint: (ep: { source: string; group: string; method: string }) => void
  onExportPng: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const adjRef = useRef<Map<string, Set<string>>>(new Map())

  const { nodes, edges } = useMemo(
    () => buildGraph(sourceMap, layout, showSchemas),
    [sourceMap, layout, showSchemas],
  )

  // Keep adjacency map in sync with sourceMap
  useEffect(() => {
    adjRef.current = buildAdjacency(sourceMap)
  }, [sourceMap])

  const applyDimming = useCallback((connectedIds: Set<string> | null) => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    const nodeEls = wrapper.querySelectorAll<HTMLElement>(".react-flow__node")
    for (const el of nodeEls) {
      const id = el.getAttribute("data-id")
      if (!connectedIds || !id) {
        el.style.opacity = ""
        el.style.transition = "opacity 150ms"
      } else {
        el.style.transition = "opacity 150ms"
        el.style.opacity = connectedIds.has(id) ? "" : "0.25"
      }
    }

    const edgeEls = wrapper.querySelectorAll<HTMLElement>(".react-flow__edge")
    for (const el of edgeEls) {
      el.style.transition = "opacity 150ms"
      if (!connectedIds) {
        el.style.opacity = ""
      } else {
        // Edge source/target are encoded in data attributes
        const sourceId = el.getAttribute("data-source")
        const targetId = el.getAttribute("data-target")
        const isConnected =
          sourceId && targetId && connectedIds.has(sourceId) && connectedIds.has(targetId)
        el.style.opacity = isConnected ? "" : "0.25"
      }
    }
  }, [])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id.startsWith("endpoint:")) {
        const parts = node.id.replace("endpoint:", "").split(".")
        if (parts.length === 3) {
          onSelectEndpoint({ source: parts[0]!, group: parts[1]!, method: parts[2]! })
        }
      }
    },
    [onSelectEndpoint],
  )

  const onNodeMouseEnter = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const connected = getConnectedIds(adjRef.current, node.id)
      applyDimming(connected)
    },
    [applyDimming],
  )

  const onNodeMouseLeave = useCallback(() => {
    applyDimming(null)
  }, [applyDimming])

  return (
    <div ref={wrapperRef} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="[&_.react-flow__background]:!bg-transparent"
      >
        <Background gap={20} size={1} color="rgba(63, 63, 70, 0.3)" />
        <Controls
          showInteractive={false}
          className="!bg-surface-1 !border-border-default !shadow-lg [&_button]:!bg-surface-2 [&_button]:!border-border-default [&_button]:!text-text-muted [&_button:hover]:!bg-surface-3 [&_svg]:!fill-text-muted"
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === "source") return "rgba(99, 102, 241, 0.6)"
            if (node.type === "group") return "rgba(161, 161, 170, 0.4)"
            return "rgba(52, 211, 153, 0.5)"
          }}
          maskColor="rgba(0, 0, 0, 0.7)"
          className="!bg-surface-1 !border-border-default"
        />
        <Panel position="top-right">
          <button
            type="button"
            onClick={onExportPng}
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

// ── Graph View Component (with Provider) ────────────────────────────────────

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

  const handleExportPng = useCallback(() => {
    // Find the viewport element inside our specific graph wrapper
    const wrapper = graphRef.current
    if (!wrapper) return
    const viewport = wrapper.querySelector(".react-flow__viewport") as SVGElement | null
    if (!viewport) return

    // Get the bounding box of all nodes to determine export dimensions
    const nodeEls = wrapper.querySelectorAll<HTMLElement>(".react-flow__node")
    if (nodeEls.length === 0) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const node of nodeEls) {
      const rect = node.getBoundingClientRect()
      minX = Math.min(minX, rect.left)
      minY = Math.min(minY, rect.top)
      maxX = Math.max(maxX, rect.right)
      maxY = Math.max(maxY, rect.bottom)
    }

    const padding = 40
    const width = maxX - minX + padding * 2
    const height = maxY - minY + padding * 2

    // Use foreignObject in SVG to capture the DOM content
    const svgNs = "http://www.w3.org/2000/svg"
    const svg = document.createElementNS(svgNs, "svg")
    svg.setAttribute("width", String(width))
    svg.setAttribute("height", String(height))
    svg.setAttribute("xmlns", svgNs)

    const fo = document.createElementNS(svgNs, "foreignObject")
    fo.setAttribute("width", "100%")
    fo.setAttribute("height", "100%")

    const flowEl = wrapper.querySelector(".react-flow") as HTMLElement | null
    if (!flowEl) return

    const clone = flowEl.cloneNode(true) as HTMLElement
    clone.style.width = `${width}px`
    clone.style.height = `${height}px`
    clone.style.position = "relative"

    fo.appendChild(clone)
    svg.appendChild(fo)

    const svgData = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
    const url = URL.createObjectURL(blob)

    // Download as SVG (more reliable than canvas conversion for complex DOM)
    const link = document.createElement("a")
    link.download = "nexus-api-graph.svg"
    link.href = url
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div ref={graphRef} className="h-full w-full" style={{ minHeight: 400 }}>
      <ReactFlowProvider>
        <GraphInner
          sourceMap={sourceMap}
          layout={layout}
          showSchemas={showSchemas}
          onSelectEndpoint={onSelectEndpoint}
          onExportPng={handleExportPng}
        />
      </ReactFlowProvider>
    </div>
  )
}
