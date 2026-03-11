import type { Node, Edge } from "@xyflow/react"
import { MarkerType } from "@xyflow/react"

import type { SourceMap, RequestEntry } from "../../store"
import { computeEndpointStats, computeMiddlewareStats } from "./pipeline-stats"

// Re-export for consumers
export type { MiddlewareStats, EndpointStats } from "./pipeline-stats"
export { computeEndpointStats, computeMiddlewareStats } from "./pipeline-stats"

const PIPELINE_X_GAP = 200

export function buildPipeline(
  sourceMap: SourceMap,
  selected: { source: string; group: string; method: string },
  requests: RequestEntry[]
): { nodes: Node[]; edges: Edge[] } | null {
  const source = sourceMap[selected.source]
  if (!source) return null
  const group = source.groups[selected.group]
  if (!group) return null
  const ep = group.endpoints[selected.method]
  if (!ep) return null

  const middleware = ep.middleware ?? []
  const relevantRequests = requests.filter(
    (r) => r.source === selected.source && r.group === selected.group && r.method === selected.method
  )

  const epStats = computeEndpointStats(relevantRequests, selected.source, selected.group, selected.method)
  const mwStats = computeMiddlewareStats(relevantRequests, selected.source, selected.group, selected.method, middleware.length)

  const nodes: Node[] = []
  const edges: Edge[] = []
  let x = 0

  // 1. Variables validation
  const varValidId = "pipeline:var-validation"
  nodes.push({
    id: varValidId,
    type: "validation",
    position: { x, y: 0 },
    data: { label: "Validation", target: "variables", hasSchema: ep.hasVariablesSchema ?? false },
  })
  x += PIPELINE_X_GAP

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
    x += PIPELINE_X_GAP
  }

  // 3. Endpoint
  const epId = "pipeline:endpoint"
  const epColor = ep.type === "query" ? "rgba(56, 189, 248, 0.4)" : "rgba(251, 146, 60, 0.4)"
  const epMarkerColor = ep.type === "query" ? "rgba(56, 189, 248, 0.5)" : "rgba(251, 146, 60, 0.5)"
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
    style: { stroke: epColor, strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: epMarkerColor },
  })
  x += PIPELINE_X_GAP

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
