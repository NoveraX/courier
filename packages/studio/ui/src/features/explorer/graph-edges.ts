import type { EndpointMetrics } from "./endpoint-metrics";
import type { GraphEdge, GraphNode } from "./graph-types";

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

/**
 * The curve from a parent to a child: red where a twentieth of the child's
 * calls failed, blue while it is active and dashed and moving whatever its
 * colour, thicker the more calls a minute, faded off the hovered branch.
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
  const [x1, y1, x2, y2] = [a.x + a.width, a.y + a.height / 2, b.x, b.y + b.height / 2];
  const mid = (x1 + x2) / 2;
  const on = related(a.id, hover) && related(b.id, hover);
  const bad = m.errors > 0 && m.errorRate >= 5;
  return {
    id: `${a.id}>${b.id}`,
    path: `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
    tone: bad ? "err" : m.active ? "live" : "plain",
    moving: m.active,
    width: Math.min(3, 1 + m.perMinute / 6),
    opacity: on ? (m.active || bad ? 0.9 : 0.7) : 0.12,
  };
}
