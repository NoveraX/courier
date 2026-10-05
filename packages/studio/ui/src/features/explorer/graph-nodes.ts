import type { EndpointNode, GroupNode, SourceNode } from "./explorer-model";
import { related } from "./graph-edges";
import type { GraphNode, GraphOptions } from "./graph-types";
import { GRAPH } from "./graph-types";
import { methodLabelOf } from "./method-label";
import { metricValue } from "./metric-value";

/**
 * An endpoint's node, centred on its row: its method and path, its figure,
 * lit when on the hovered branch and matching the search.
 *
 * @param e - The endpoint
 * @param centre - Its row's centre
 * @param options - The metric, the threshold, the search, the hovered and the selected node
 * @returns The node
 * @example
 * ```ts
 * endpointNodeOf(endpoint, 76, options).label; // "create"
 * ```
 */
export function endpointNodeOf(e: EndpointNode, centre: number, options: GraphOptions): GraphNode {
  const q = options.query.trim().toLowerCase();
  const id = `e:${e.key}`;
  const matched = !q || e.key.toLowerCase().includes(q);
  const { height, width, x } = {
    height: GRAPH.height.endpoint,
    width: GRAPH.width.endpoint,
    x: GRAPH.x.endpoint,
  };
  return {
    id,
    kind: "endpoint",
    key: e.key,
    x,
    y: centre - height / 2,
    width,
    height,
    label: e.method,
    sub: e.path,
    method: methodLabelOf(e),
    value: metricValue(e.metrics, options.metric, options.slowMs),
    level: e.level,
    active: e.metrics.active,
    dim: !(related(id, options.hover) && matched),
    matched: q !== "" && matched,
    selected: options.selected === e.key,
  };
}

/**
 * A group's or a source's node, centred between its children.
 *
 * @param node - The group or source
 * @param centre - Its centre
 * @param options - The metric, the threshold and the hovered node
 * @returns The node
 * @example
 * ```ts
 * parentNodeOf({ kind: "group", group }, 120, options).label; // "orders"
 * ```
 */
export function parentNodeOf(
  node: { kind: "group"; group: GroupNode } | { kind: "source"; source: SourceNode },
  centre: number,
  options: GraphOptions,
): GraphNode {
  const { kind } = node;
  const height = GRAPH.height[kind];
  const base =
    node.kind === "group"
      ? {
          key: node.group.key,
          label: node.group.name,
          sub: undefined,
          metrics: node.group.metrics,
          level: node.group.level,
          active: false,
        }
      : {
          key: node.source.name,
          label: node.source.name,
          sub: node.source.baseURL.replace(/^https?:\/\//, ""),
          metrics: node.source.metrics,
          level: node.source.level,
          active: node.source.metrics.active,
        };
  const id = `${kind === "group" ? "g" : "s"}:${base.key}`;
  return {
    id,
    kind,
    key: base.key,
    x: GRAPH.x[kind],
    y: centre - height / 2,
    width: GRAPH.width[kind],
    height,
    label: base.label,
    sub: base.sub,
    method: undefined,
    value: metricValue(base.metrics, options.metric, options.slowMs),
    level: base.level,
    active: base.active,
    dim: !related(id, options.hover),
    matched: false,
    selected: false,
  };
}
