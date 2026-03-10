import { useMemo } from "react"
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react"
import { Shield, Zap, CheckCircle, XCircle, ArrowRight } from "lucide-react"

import type { SourceMap, RequestEntry } from "../../store"
import { Badge, formatDuration } from "../../components/ui"

// ── Compute runtime stats from request history ──────────────────────────────

interface MiddlewareStats {
  calls: number
  avgDuration: number
  errors: number
}

interface EndpointStats {
  calls: number
  avgTotal: number
  avgFetch: number
  errorRate: number
}

function computeEndpointStats(
  requests: RequestEntry[],
  source: string,
  group: string,
  method: string,
): EndpointStats | null {
  const matching = requests.filter(
    (r) => r.source === source && r.group === group && r.method === method && r.status !== "pending",
  )
  if (matching.length === 0) return null

  const errors = matching.filter((r) => r.status === "error" || r.status === "validation_error")
  const withTiming = matching.filter((r) => r.timing)

  return {
    calls: matching.length,
    avgTotal: withTiming.length > 0
      ? withTiming.reduce((s, r) => s + (r.timing?.total ?? 0), 0) / withTiming.length
      : 0,
    avgFetch: withTiming.length > 0
      ? withTiming.reduce((s, r) => s + (r.timing?.fetch ?? 0), 0) / withTiming.length
      : 0,
    errorRate: (errors.length / matching.length) * 100,
  }
}

function computeMiddlewareStats(
  requests: RequestEntry[],
  source: string,
  group: string,
  method: string,
  mwCount: number,
): MiddlewareStats | null {
  const matching = requests.filter(
    (r) => r.source === source && r.group === group && r.method === method && r.timing,
  )
  if (matching.length === 0 || mwCount === 0) return null

  const totalMwTime = matching.reduce((s, r) => s + (r.timing?.middleware ?? 0), 0)
  const errors = matching.filter((r) => r.status === "error").length

  return {
    calls: matching.length,
    avgDuration: totalMwTime / matching.length / mwCount,
    errors,
  }
}

// ── Custom pipeline node components ─────────────────────────────────────────

function ValidationNode({
  data,
}: {
  data: { label: string; target: "variables" | "response"; hasSchema: boolean }
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 shadow-lg ${
        data.hasSchema
          ? "border-emerald-500/30 bg-emerald-500/8"
          : "border-zinc-600/50 bg-surface-2"
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!w-2 !h-2 ${data.hasSchema ? "!bg-emerald-400" : "!bg-zinc-400"}`} />
      <Handle type="source" position={Position.Right} className={`!w-2 !h-2 ${data.hasSchema ? "!bg-emerald-400" : "!bg-zinc-400"}`} />
      <div className="flex items-center gap-2">
        {data.hasSchema ? (
          <CheckCircle size={12} className="text-emerald-400" />
        ) : (
          <XCircle size={12} className="text-zinc-500" />
        )}
        <span className="text-[10px] font-medium text-text-primary">{data.label}</span>
      </div>
      <div className="mt-1 text-[9px] text-text-muted">
        {data.target === "variables" ? "Input" : "Output"} validation
      </div>
      <div className="mt-0.5 text-[9px] text-text-muted">
        {data.hasSchema ? "Schema defined" : "No schema"}
      </div>
    </div>
  )
}

function MiddlewareNode({
  data,
}: {
  data: { label: string; index: number; stats: MiddlewareStats | null }
}) {
  return (
    <div className="rounded-lg border border-violet-500/30 bg-violet-500/8 px-3 py-2.5 shadow-lg">
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-violet-400" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-violet-400" />
      <div className="flex items-center gap-2">
        <Shield size={12} className="text-violet-400" />
        <span className="text-[10px] font-medium text-text-primary">{data.label}</span>
      </div>
      <div className="mt-1 text-[9px] text-text-muted">Middleware #{data.index + 1}</div>
      {data.stats && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className={`text-[9px] ${data.stats.avgDuration > 5 ? "text-amber-400" : "text-text-muted"}`}>
            ~{formatDuration(data.stats.avgDuration)}
          </span>
          {data.stats.errors > 0 && (
            <span className="text-[9px] text-red-400">{data.stats.errors} err</span>
          )}
        </div>
      )}
    </div>
  )
}

function EndpointPipelineNode({
  data,
}: {
  data: {
    label: string
    type: "query" | "mutation"
    prefix: string
    method: string
    stats: EndpointStats | null
  }
}) {
  const isQuery = data.type === "query"
  return (
    <div
      className={`rounded-lg border px-4 py-3 shadow-lg ${
        isQuery
          ? "border-sky-500/30 bg-sky-500/10"
          : "border-orange-500/30 bg-orange-500/10"
      }`}
    >
      <Handle type="target" position={Position.Left} className={`!w-2 !h-2 ${isQuery ? "!bg-sky-400" : "!bg-orange-400"}`} />
      <Handle type="source" position={Position.Right} className={`!w-2 !h-2 ${isQuery ? "!bg-sky-400" : "!bg-orange-400"}`} />
      <div className="flex items-center gap-2">
        <Zap size={12} className={isQuery ? "text-sky-400" : "text-orange-400"} />
        <span className="text-xs font-semibold text-text-primary">{data.label}</span>
        <Badge variant={isQuery ? "sky" : "orange"}>{data.type}</Badge>
      </div>
      <div className="mt-1 text-[10px] text-text-muted">
        {isQuery ? "GET" : "POST"} {data.prefix}/{data.method}
      </div>
      {data.stats && (
        <div className="mt-1.5 flex items-center gap-2 text-[9px]">
          <span className="text-text-muted">{data.stats.calls} calls</span>
          <span className={data.stats.avgTotal > 500 ? "text-red-400" : data.stats.avgTotal > 200 ? "text-amber-400" : "text-emerald-400"}>
            ~{formatDuration(data.stats.avgTotal)}
          </span>
          {data.stats.errorRate > 0 && (
            <span className={data.stats.errorRate > 10 ? "text-red-400" : "text-amber-400"}>
              {data.stats.errorRate.toFixed(0)}% err
            </span>
          )}
        </div>
      )}
    </div>
  )
}

const pipelineNodeTypes: NodeTypes = {
  validation: ValidationNode,
  middleware: MiddlewareNode,
  pipelineEndpoint: EndpointPipelineNode,
}

// ── Build pipeline ──────────────────────────────────────────────────────────

function buildPipeline(
  sourceMap: SourceMap,
  selected: { source: string; group: string; method: string },
  requests: RequestEntry[],
): { nodes: Node[]; edges: Edge[] } | null {
  const source = sourceMap[selected.source]
  if (!source) return null
  const group = source.groups[selected.group]
  if (!group) return null
  const ep = group.endpoints[selected.method]
  if (!ep) return null

  const middleware = ep.middleware ?? []
  const epStats = computeEndpointStats(requests, selected.source, selected.group, selected.method)
  const mwStats = computeMiddlewareStats(requests, selected.source, selected.group, selected.method, middleware.length)

  const nodes: Node[] = []
  const edges: Edge[] = []
  const xGap = 200
  let x = 0

  // 1. Variables validation
  const varValidId = "pipeline:var-validation"
  nodes.push({
    id: varValidId,
    type: "validation",
    position: { x, y: 0 },
    data: { label: "Validation", target: "variables", hasSchema: ep.hasVariablesSchema ?? false },
  })
  x += xGap

  let prevId = varValidId

  // 2. Middleware chain
  for (let i = 0; i < middleware.length; i++) {
    const mwId = `pipeline:mw-${i}`
    nodes.push({
      id: mwId,
      type: "middleware",
      position: { x, y: 0 },
      data: { label: middleware[i], index: i, stats: mwStats },
    })
    edges.push({
      id: `e:${prevId}->${mwId}`,
      source: prevId,
      target: mwId,
      type: "smoothstep",
      animated: true,
      style: { stroke: "rgba(139, 92, 246, 0.4)", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(139, 92, 246, 0.5)" },
    })
    prevId = mwId
    x += xGap
  }

  // 3. Endpoint
  const epId = "pipeline:endpoint"
  nodes.push({
    id: epId,
    type: "pipelineEndpoint",
    position: { x, y: 0 },
    data: {
      label: `${selected.group}.${selected.method}`,
      type: ep.type,
      prefix: group.prefix,
      method: selected.method,
      stats: epStats,
    },
  })
  edges.push({
    id: `e:${prevId}->${epId}`,
    source: prevId,
    target: epId,
    type: "smoothstep",
    animated: true,
    style: {
      stroke: ep.type === "query" ? "rgba(56, 189, 248, 0.4)" : "rgba(251, 146, 60, 0.4)",
      strokeWidth: 1.5,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: ep.type === "query" ? "rgba(56, 189, 248, 0.5)" : "rgba(251, 146, 60, 0.5)",
    },
  })
  x += xGap

  // 4. Response validation
  const resValidId = "pipeline:res-validation"
  nodes.push({
    id: resValidId,
    type: "validation",
    position: { x, y: 0 },
    data: { label: "Validation", target: "response", hasSchema: ep.hasResponseSchema ?? false },
  })
  edges.push({
    id: `e:${epId}->${resValidId}`,
    source: epId,
    target: resValidId,
    type: "smoothstep",
    animated: true,
    style: { stroke: "rgba(52, 211, 153, 0.4)", strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(52, 211, 153, 0.5)" },
  })

  return { nodes, edges }
}

// ── Pipeline View Component ─────────────────────────────────────────────────

export function PipelineView({
  sourceMap,
  selected,
  requests,
}: {
  sourceMap: SourceMap
  selected: { source: string; group: string; method: string } | null
  requests: RequestEntry[]
}) {
  const graph = useMemo(
    () => (selected ? buildPipeline(sourceMap, selected, requests) : null),
    [sourceMap, selected, requests],
  )

  if (!selected || !graph) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted">
        <ArrowRight size={32} strokeWidth={1} />
        <p className="text-xs">Select an endpoint from Graph or List view to see its pipeline</p>
      </div>
    )
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
