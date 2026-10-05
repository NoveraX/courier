import type { EndpointMetrics } from "./endpoint-metrics";
import type { GraphBranch, GraphEdge, GraphNode } from "./graph-types";

/**
 * Whether a node is the hovered one or on its branch: a source's groups
 * and endpoints, a group's source, the groups it sits in and everything
 * inside it, an endpoint's groups and source.
 *
 * @param id - The node
 * @param hover - The hovered node, if any
 * @returns `true` when the node stays lit
 * @example
 * ```ts
 * related("g:api.orders", "e:api.orders.create"); // true
 * ```
 */
export function related(id: string, hover: string | undefined): boolean {
  if (!hover) return true;
  const [kind, key] = [hover.slice(0, 1), hover.slice(2)];
  const [nodeKind, nodeKey] = [id.slice(0, 1), id.slice(2)];
  if (kind === "s") return nodeKey === key || nodeKey.startsWith(`${key}.`);
  if (kind === "g") {
    return (
      nodeKey === key ||
      nodeKey.startsWith(`${key}.`) ||
      (nodeKind !== "e" && key.startsWith(`${nodeKey}.`))
    );
  }
  return nodeKey === key || (nodeKind !== "e" && key.startsWith(`${nodeKey}.`));
}

/* A child's curve from its parent's right side to its own left one, level at both ends. */
function curve(a: GraphNode, b: GraphNode): { from: string; rest: string; length: number } {
  const [x1, y1, x2, y2] = [a.x + a.width, a.y + a.height / 2, b.x, b.y + b.height / 2];
  const mid = (x1 + x2) / 2;
  /* A level-ended cubic runs between its chord and its control polygon. */
  const [dx, dy] = [x2 - x1, Math.abs(y2 - y1)];
  return {
    from: `M${x1} ${y1}`,
    rest: `C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
    length: (Math.hypot(dx, dy) + dx + dy) / 2,
  };
}

/**
 * The curve from a parent to a child: red where a twentieth of the child's
 * calls failed, blue while it is active, faded off the hovered branch. It
 * stays thin whatever the traffic: the calls running along it show that.
 *
 * @param a - The parent
 * @param b - The child
 * @param m - The child's metrics
 * @param hover - The hovered node, if any
 * @returns The edge
 * @example
 * ```ts
 * edgeOf(groupNode, endpointNode, endpoint.metrics, undefined).tone; // "plain"
 * ```
 */
export function edgeOf(
  a: GraphNode,
  b: GraphNode,
  m: EndpointMetrics,
  hover: string | undefined,
): GraphEdge {
  const { from, rest } = curve(a, b);
  const on = related(a.id, hover) && related(b.id, hover);
  const bad = m.errors > 0 && m.errorRate >= 5;
  return {
    id: `${a.id}>${b.id}`,
    path: `${from} ${rest}`,
    tone: bad ? "err" : m.active ? "live" : "plain",
    opacity: on ? (m.active || bad ? 0.9 : 0.6) : 0.12,
  };
}

/**
 * The way a call runs to an endpoint: along its source's curve into its
 * first group's card, out of each card's other side and along the curve to
 * the next — a group inside it, or the endpoint — or straight from the
 * source to an endpoint outside any group. A call to an endpoint of a
 * folded group ends at the folded group's card.
 *
 * @param source - The endpoint's source
 * @param groups - The groups it sits in, outermost first; none for one outside any
 * @param endpoint - The endpoint, or the folded group that hides it
 * @returns The way, and about how long it is
 * @example
 * ```ts
 * branchOf(sourceNode, [groupNode], endpointNode).path; // "M236 77 C… M482 101 C…"
 * ```
 */
export function branchOf(
  source: GraphNode,
  groups: readonly GraphNode[],
  endpoint: GraphNode,
): GraphBranch {
  const stops = [source, ...groups, endpoint];
  const legs = stops.slice(1).map((stop, i) => curve(stops[i] ?? source, stop));
  /* A move, not a line: the call crosses each card at once, out of sight, so it is seen all the way. */
  const path = legs
    .map((leg, i) => {
      const card = stops[i];
      return i === 0 || !card
        ? `${leg.from} ${leg.rest}`
        : `M${card.x + card.width} ${card.y + card.height / 2} ${leg.rest}`;
    })
    .join(" ");
  return { path, length: legs.reduce((sum, leg) => sum + leg.length, 0) };
}
