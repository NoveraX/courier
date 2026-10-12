/** How a node of the Explorer's graph is doing. */
export type Health = "ok" | "warn" | "err" | "idle"

/** What a node of the graph is: a source, a group or an endpoint. */
export type GraphKind = "source" | "group" | "endpoint"

/** A node of the graph, in its column. */
export interface GraphNode {
  kind: GraphKind
  label: string
  y: number
  health: Health
}

/** One way of laying the graph out: its size before it is scaled to its frame, and its columns. */
export interface GraphLayout {
  width: number
  height: number
  /** Where each column starts. */
  x: Readonly<Record<GraphKind, number>>
  /** How wide a node of each column is. */
  nodeWidth: Readonly<Record<GraphKind, number>>
  /** Whether a node keeps its padding tight, so that a narrow column holds its label. */
  tight: boolean
}

/** The columns at their ease, for a frame that holds them at a readable size. */
export const WIDE_GRAPH: GraphLayout = {
  width: 560,
  height: 340,
  x: { source: 30, group: 200, endpoint: 380 },
  nodeWidth: { source: 120, group: 120, endpoint: 150 },
  tight: false,
}

/** The columns drawn closer, for a phone: its labels stay readable instead of shrinking with the graph. */
export const NARROW_GRAPH: GraphLayout = {
  width: 356,
  height: 340,
  x: { source: 6, group: 118, endpoint: 232 },
  nodeWidth: { source: 86, group: 92, endpoint: 118 },
  tight: true,
}

/** Below this width a frame draws the graph narrow: drawn wide, its labels would shrink under 10 px. */
export const NARROW_BELOW = 520

/**
 * The layout a frame of a width draws the graph in: narrow on a phone,
 * wide otherwise — and wide before the frame has been measured.
 *
 * @param frame - The frame's width, in px; 0 before it is measured
 * @returns The layout
 * @example
 * ```ts
 * graphLayoutFor(343) // NARROW_GRAPH
 * ```
 */
export function graphLayoutFor(frame: number): GraphLayout {
  return frame > 0 && frame < NARROW_BELOW ? NARROW_GRAPH : WIDE_GRAPH
}

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
  { kind: "source", label: "api", y: 90, health: "ok" },
  { kind: "source", label: "billing", y: 230, health: "err" },
  { kind: "group", label: "users", y: 55, health: "ok" },
  { kind: "group", label: "orders", y: 125, health: "ok" },
  { kind: "group", label: "invoices", y: 230, health: "err" },
  { kind: "endpoint", label: "GET list", y: 35, health: "ok" },
  { kind: "endpoint", label: "PATCH update", y: 75, health: "ok" },
  { kind: "endpoint", label: "POST create", y: 115, health: "ok" },
  { kind: "endpoint", label: "GET list", y: 155, health: "warn" },
  { kind: "endpoint", label: "GET list", y: 215, health: "err" },
  { kind: "endpoint", label: "POST void", y: 255, health: "idle" },
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
 * The curve an edge is drawn along, from its parent's right side to its
 * child's left.
 *
 * @param edge - The edge, as its two nodes' places
 * @param layout - The layout the graph is drawn in
 * @returns The SVG path
 * @example
 * ```ts
 * edgePath([0, 2]) // "M150 90 C175 90, 175 55, 200 55"
 * ```
 */
export function edgePath(
  [from, to]: readonly [number, number],
  layout: GraphLayout = WIDE_GRAPH
): string {
  const a = GRAPH_NODES[from]
  const b = GRAPH_NODES[to]
  if (!a || !b) return ""
  const x1 = layout.x[a.kind] + layout.nodeWidth[a.kind]
  const x2 = layout.x[b.kind]
  const middle = (x1 + x2) / 2
  return `M${x1} ${a.y} C${middle} ${a.y}, ${middle} ${b.y}, ${x2} ${b.y}`
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
