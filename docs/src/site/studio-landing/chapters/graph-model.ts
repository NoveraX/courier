/** How a node of the Explorer's graph is doing. */
export type Health = "ok" | "warn" | "err" | "idle"

/** A node of the graph: a source, a group or an endpoint. */
export interface GraphNode {
  kind: "source" | "group" | "endpoint"
  label: string
  x: number
  y: number
  health: Health
}

/** The graph's size before it is scaled to its frame. */
export const GRAPH_SIZE = { width: 560, height: 340 } as const

const WIDTH = { source: 120, group: 120, endpoint: 150 } as const

/**
 * Two sources, their groups and their endpoints, laid out left to right,
 * each with its health.
 *
 * @example
 * ```ts
 * GRAPH_NODES[1].health // "err"
 * ```
 */
export const GRAPH_NODES: readonly GraphNode[] = [
  { kind: "source", label: "api", x: 30, y: 90, health: "ok" },
  { kind: "source", label: "billing", x: 30, y: 230, health: "err" },
  { kind: "group", label: "users", x: 200, y: 55, health: "ok" },
  { kind: "group", label: "orders", x: 200, y: 125, health: "ok" },
  { kind: "group", label: "invoices", x: 200, y: 230, health: "err" },
  { kind: "endpoint", label: "GET list", x: 380, y: 35, health: "ok" },
  { kind: "endpoint", label: "PATCH update", x: 380, y: 75, health: "ok" },
  { kind: "endpoint", label: "POST create", x: 380, y: 115, health: "ok" },
  { kind: "endpoint", label: "GET list", x: 380, y: 155, health: "warn" },
  { kind: "endpoint", label: "GET list", x: 380, y: 215, health: "err" },
  { kind: "endpoint", label: "POST void", x: 380, y: 255, health: "idle" },
]

/** Which node each edge joins: source to group, group to endpoint. */
export const GRAPH_EDGES: readonly (readonly [number, number])[] = [
  [0, 2],
  [0, 3],
  [1, 4],
  [2, 5],
  [2, 6],
  [3, 7],
  [3, 8],
  [4, 9],
  [4, 10],
]

/** The order the edges light up in, one a step. */
const HOT_ORDER = [0, 3, 1, 5, 2, 7, 6, 8, 4]

/**
 * A node's width on the graph.
 *
 * @param node - The node
 * @returns Its width
 * @example
 * ```ts
 * nodeWidth(GRAPH_NODES[5]) // 150
 * ```
 */
export function nodeWidth(node: GraphNode): number {
  return WIDTH[node.kind]
}

/**
 * The curve an edge is drawn along, from its parent's right side to its
 * child's left.
 *
 * @param edge - The edge, as its two nodes' places
 * @returns The SVG path
 * @example
 * ```ts
 * edgePath([0, 2]) // "M150 90 C175 90, 175 55, 200 55"
 * ```
 */
export function edgePath([from, to]: readonly [number, number]): string {
  const a = GRAPH_NODES[from]
  const b = GRAPH_NODES[to]
  if (!a || !b) return ""
  const x1 = a.x + nodeWidth(a)
  const middle = (x1 + b.x) / 2
  return `M${x1} ${a.y} C${middle} ${a.y}, ${middle} ${b.y}, ${b.x} ${b.y}`
}

/**
 * The edge lit at a step: each in turn, lighting the two nodes it joins.
 *
 * @param step - The visual's clock
 * @returns The edge's place in {@link GRAPH_EDGES}
 * @example
 * ```ts
 * hotEdge(1) // 3
 * ```
 */
export function hotEdge(step: number): number {
  return HOT_ORDER[step % HOT_ORDER.length] ?? 0
}
