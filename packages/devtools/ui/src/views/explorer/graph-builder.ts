import type { Node, Edge } from "@xyflow/react"
import { MarkerType } from "@xyflow/react"

import type { SourceMap, GraphLayout } from "../../store"
import { NODE_DELIM } from "./helpers"

// ── Layout constants ────────────────────────────────────────────────────────

const COL_GAP = 280
const ROW_GAP = 200
const ENDPOINT_ROW_HEIGHT = 52
const SOURCE_VERTICAL_PAD = 80
const SOURCE_HORIZONTAL_SPREAD = 400
const GROUP_HORIZONTAL_SPREAD = 180

// ── Build adjacency map for hover highlight flood-fill ──────────────────────

export function buildAdjacency(sourceMap: SourceMap) {
  const adj = new Map<string, Set<string>>()
  const addEdge = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    for (const [groupName, group] of Object.entries(source.groups)) {
      addEdge(`source:${sourceName}`, `group:${sourceName}${NODE_DELIM}${groupName}`)
      for (const methodName of Object.keys(group.endpoints)) {
        addEdge(
          `group:${sourceName}${NODE_DELIM}${groupName}`,
          `endpoint:${sourceName}${NODE_DELIM}${groupName}${NODE_DELIM}${methodName}`,
        )
      }
    }
  }
  return adj
}

/** BFS from a node to find all connected IDs */
export function getConnectedIds(adj: Map<string, Set<string>>, startId: string): Set<string> {
  const visited = new Set<string>([startId])
  const queue = [startId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
  }
  return visited
}

// ── Build nodes & edges from SourceMap ──────────────────────────────────────

export function buildGraph(
  sourceMap: SourceMap,
  layout: GraphLayout,
  showSchemas: boolean,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const isLR = layout === "LR"
  const colGap = isLR ? COL_GAP : 0
  const rowGap = isLR ? 0 : ROW_GAP

  let sourceIdx = 0
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    const groupNames = Object.keys(source.groups)
    const totalEndpoints = groupNames.reduce(
      (acc, g) => acc + Object.keys(source.groups[g]!.endpoints).length, 0,
    )

    const sourceY = isLR ? sourceIdx * (totalEndpoints * ENDPOINT_ROW_HEIGHT + SOURCE_VERTICAL_PAD) : 0
    const sourceX = isLR ? 0 : sourceIdx * SOURCE_HORIZONTAL_SPREAD
    const sourceId = `source:${sourceName}`

    nodes.push({
      id: sourceId, type: "source",
      position: { x: sourceX, y: sourceY },
      data: { label: sourceName, baseURL: source.baseURL, groupCount: groupNames.length, layout },
    })

    let endpointOffset = 0

    for (const [groupName, group] of Object.entries(source.groups)) {
      const endpointNames = Object.keys(group.endpoints)
      const groupId = `group:${sourceName}${NODE_DELIM}${groupName}`

      const gx = isLR ? sourceX + colGap : sourceX + endpointOffset * GROUP_HORIZONTAL_SPREAD
      const gy = isLR ? sourceY + endpointOffset * ENDPOINT_ROW_HEIGHT : sourceY + rowGap

      nodes.push({
        id: groupId, type: "group",
        position: { x: gx, y: gy },
        data: { label: groupName, prefix: group.prefix, endpointCount: endpointNames.length, layout },
      })

      edges.push({
        id: `e:${sourceName}->${groupName}`, source: sourceId, target: groupId,
        type: "smoothstep", animated: true,
        style: { stroke: "rgba(99, 102, 241, 0.4)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(99, 102, 241, 0.5)" },
      })

      for (let i = 0; i < endpointNames.length; i++) {
        const methodName = endpointNames[i]!
        const ep = group.endpoints[methodName]!
        const epId = `endpoint:${sourceName}${NODE_DELIM}${groupName}${NODE_DELIM}${methodName}`

        const ex = isLR ? gx + colGap : gx + i * GROUP_HORIZONTAL_SPREAD
        const ey = isLR ? gy + i * ENDPOINT_ROW_HEIGHT : gy + rowGap

        nodes.push({
          id: epId, type: "endpoint",
          position: { x: ex, y: ey },
          data: {
            label: methodName, type: ep.type,
            hasVariablesSchema: ep.hasVariablesSchema, hasResponseSchema: ep.hasResponseSchema,
            middleware: ep.middleware ?? [], source: sourceName, group: groupName, showSchemas, layout,
          },
        })

        edges.push({
          id: `e:${sourceName}.${groupName}->${methodName}`, source: groupId, target: epId,
          type: "smoothstep",
          style: {
            stroke: ep.type === "query" ? "rgba(52, 211, 153, 0.4)" : "rgba(251, 146, 60, 0.4)",
            strokeWidth: 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: ep.type === "query" ? "rgba(52, 211, 153, 0.5)" : "rgba(251, 146, 60, 0.5)",
          },
        })
      }

      endpointOffset += endpointNames.length
    }

    sourceIdx++
  }

  return { nodes, edges }
}

// ── Collect all CSS rules for embedding in exported SVG ─────────────────────

export function collectCssRules(): string {
  const rules: string[] = []
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        rules.push(rule.cssText)
      }
    } catch {
      // Cross-origin stylesheets can't be read — skip
    }
  }
  return rules.join("\n")
}
