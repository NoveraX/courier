import type { EndpointMetrics } from "./endpoint-metrics";
import type { GraphBranch, GraphEdge, GraphNode } from "./graph-types";

/**
 * Whether a node is the hovered one or on its branch: a source's groups
 * and endpoints, a group's source and endpoints, an endpoint's group and
 * source.
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
      (nodeKind === "s" && key.startsWith(`${nodeKey}.`))
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
 * group's card, out of the card's other side and along the group's curve
 * to it — or straight from the source to an endpoint outside any group.
 *
 * @param source - The endpoint's source
 * @param group - Its group, if it has one
 * @param endpoint - The endpoint
 * @returns The way, and about how long it is
 * @example
 * ```ts
 * branchOf(sourceNode, groupNode, endpointNode).path; // "M236 77 C… M482 101 C…"
 * ```
 */
export function branchOf(
  source: GraphNode,
  group: GraphNode | undefined,
  endpoint: GraphNode,
): GraphBranch {
  if (!group) {
    const direct = curve(source, endpoint);
    return { path: `${direct.from} ${direct.rest}`, length: direct.length };
  }
  const [inward, outward] = [curve(source, group), curve(group, endpoint)];
  /* A move, not a line: the call crosses its group's card at once, out of sight, so it is seen all the way. */
  const across = `M${group.x + group.width} ${group.y + group.height / 2}`;
  return {
    path: `${inward.from} ${inward.rest} ${across} ${outward.rest}`,
    length: inward.length + outward.length,
  };
}
