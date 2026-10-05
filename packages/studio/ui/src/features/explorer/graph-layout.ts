import type { ExplorerModel, SourceNode } from "./explorer-model";
import { edgeOf } from "./graph-edges";
import { endpointNodeOf, parentNodeOf } from "./graph-nodes";
import type { GraphEdge, GraphLayout, GraphNode, GraphOptions } from "./graph-types";
import { GRAPH } from "./graph-types";

function middle(values: readonly number[]): number {
  return (Math.min(...values) + Math.max(...values)) / 2;
}

/* A source's nodes and edges, its endpoints taking the next rows. */
function sourceGraph(
  source: SourceNode,
  firstRow: number,
  options: GraphOptions,
): { nodes: GraphNode[]; edges: GraphEdge[]; rows: number } {
  let row = firstRow;
  const centreOf = () => GRAPH.top + row++ * GRAPH.row;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const children: { node: GraphNode; metrics: SourceNode["metrics"] }[] = [];
  for (const group of source.groups) {
    const leaves = group.endpoints.map((e) => ({
      e,
      node: endpointNodeOf(e, centreOf(), options),
    }));
    const groupNode = parentNodeOf(
      { kind: "group", group },
      middle(leaves.map((l) => l.node.y + l.node.height / 2)),
      options,
    );
    nodes.push(groupNode, ...leaves.map((l) => l.node));
    for (const leaf of leaves)
      edges.push(edgeOf(groupNode, leaf.node, leaf.e.metrics, options.hover));
    children.push({ node: groupNode, metrics: group.metrics });
  }
  for (const e of source.loose) {
    const node = endpointNodeOf(e, centreOf(), options);
    nodes.push(node);
    children.push({ node, metrics: e.metrics });
  }
  if (!children.length) return { nodes: [], edges: [], rows: 0 };
  const sourceNode = parentNodeOf(
    { kind: "source", source },
    middle(children.map((c) => c.node.y + c.node.height / 2)),
    options,
  );
  for (const child of children)
    edges.push(edgeOf(sourceNode, child.node, child.metrics, options.hover));
  return { nodes: [sourceNode, ...nodes], edges, rows: row - firstRow };
}

/**
 * The graph's layout: one column each for sources, groups and endpoints, a
 * row per endpoint with each group and source centred on its own, a curve
 * from every parent to every child coloured by errors and live traffic, and
 * nodes dimmed off the hovered branch or the search.
 *
 * @param model - The Explorer's model
 * @param options - The metric, the threshold, the search, the hovered and the selected node
 * @returns The nodes, the edges and the canvas size
 * @example
 * ```ts
 * graphLayoutOf(model, { metric: "latency", slowMs: 500, query: "", hover: undefined, selected: undefined });
 * ```
 */
export function graphLayoutOf(model: ExplorerModel, options: GraphOptions): GraphLayout {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let rows = 0;
  for (const source of model.sources) {
    const part = sourceGraph(source, rows, options);
    nodes.push(...part.nodes);
    edges.push(...part.edges);
    rows += part.rows;
  }
  return {
    nodes,
    edges,
    width: GRAPH.x.endpoint + GRAPH.width.endpoint + 4,
    height: GRAPH.top + rows * GRAPH.row + 12,
    columns: [
      { x: GRAPH.x.source, label: `Sources · ${model.sources.length}` },
      { x: GRAPH.x.group, label: `Groups · ${model.groups.length}` },
      { x: GRAPH.x.endpoint, label: `Endpoints · ${model.endpoints.length}` },
    ],
  };
}
