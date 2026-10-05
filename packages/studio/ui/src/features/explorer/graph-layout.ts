import type { ExplorerModel, GroupNode, SourceNode } from "./explorer-model";
import { branchOf, edgeOf } from "./graph-edges";
import { endpointNodeOf, parentNodeOf } from "./graph-nodes";
import type { GraphBranch, GraphEdge, GraphLayout, GraphNode, GraphOptions } from "./graph-types";
import { GRAPH } from "./graph-types";
import { shownGroups } from "./shown-groups";

function middle(values: readonly number[]): number {
  return (Math.min(...values) + Math.max(...values)) / 2;
}

const centreY = (node: GraphNode): number => node.y + node.height / 2;

/** A child placed under its parent, with what its curve is coloured by, and its card and every card under it. */
type Placed = { node: GraphNode; metrics: SourceNode["metrics"]; nodes: GraphNode[] };

/** Where a call ends — an endpoint's card, or the card of the folded group hiding it — and the groups on its way, by key. */
type End = { key: string; node: GraphNode; groups: readonly string[] };

/* A source's nodes and edges, its endpoints taking the next rows. */
function sourceGraph(
  source: SourceNode,
  firstRow: number,
  options: GraphOptions,
  endpointX: number,
): { nodes: GraphNode[]; edges: GraphEdge[]; branches: [string, GraphBranch][]; rows: number } {
  let row = firstRow;
  const centreOf = () => GRAPH.top + row++ * GRAPH.row;
  const edges: GraphEdge[] = [];
  const ends: End[] = [];
  const groupNodes = new Map<string, GraphNode>();
  const folded = options.folded ?? new Set<string>();

  /* A group with the groups inside it and its endpoints below it, or one folded card. */
  const placeGroup = (group: GroupNode, above: readonly string[]): Placed => {
    const inner = source.groups.filter((g) => g.parent === group.key);
    const holds = inner.length > 0 || group.endpoints.length > 0;
    const fold = holds
      ? { folded: folded.has(group.key), hidden: group.subtree.length }
      : undefined;
    const way = [...above, group.key];
    const kids: Placed[] = [];
    if (!fold?.folded) {
      for (const g of inner) kids.push(placeGroup(g, way));
      for (const e of group.endpoints) {
        const node = endpointNodeOf(e, centreOf(), options, endpointX);
        kids.push({ node, metrics: e.metrics, nodes: [node] });
        ends.push({ key: e.key, node, groups: way });
      }
    }
    const centre = kids.length ? middle(kids.map((k) => centreY(k.node))) : centreOf();
    const node = parentNodeOf({ kind: "group", group, fold }, centre, options);
    groupNodes.set(group.key, node);
    for (const kid of kids) edges.push(edgeOf(node, kid.node, kid.metrics, options.hover));
    if (fold?.folded) for (const e of group.subtree) ends.push({ key: e.key, node, groups: above });
    return { node, metrics: group.metrics, nodes: [node, ...kids.flatMap((k) => k.nodes)] };
  };

  const children = source.groups.filter((g) => g.depth === 0).map((g) => placeGroup(g, []));
  for (const e of source.loose) {
    const node = endpointNodeOf(e, centreOf(), options, endpointX);
    children.push({ node, metrics: e.metrics, nodes: [node] });
    ends.push({ key: e.key, node, groups: [] });
  }
  if (!children.length) return { nodes: [], edges: [], branches: [], rows: 0 };
  const sourceNode = parentNodeOf(
    { kind: "source", source },
    middle(children.map((c) => centreY(c.node))),
    options,
  );
  for (const child of children) {
    edges.push(edgeOf(sourceNode, child.node, child.metrics, options.hover));
  }
  const branches = ends.map(({ key, node, groups }): [string, GraphBranch] => [
    key,
    branchOf(
      sourceNode,
      groups.flatMap((k) => groupNodes.get(k) ?? []),
      node,
    ),
  ]);
  const nodes = [sourceNode, ...children.flatMap((c) => c.nodes)];
  return { nodes, edges, branches, rows: row - firstRow };
}

/**
 * The graph's layout: a column for sources, one for each level of groups
 * shown — a group inside another a column to its right — and one for
 * endpoints; a row per endpoint, each group and source centred on its own,
 * a folded group one row; a curve from every parent to every child
 * coloured by errors and live traffic, and nodes dimmed off the hovered
 * branch or the search.
 *
 * @param model - The Explorer's model
 * @param options - The metric, the threshold, the search, the hovered and the selected node, the groups folded
 * @returns The nodes, the edges and the canvas size
 * @example
 * ```ts
 * graphLayoutOf(model, { metric: "latency", slowMs: 500, query: "", hover: undefined, selected: undefined });
 * ```
 */
export function graphLayoutOf(model: ExplorerModel, options: GraphOptions): GraphLayout {
  const shown = shownGroups(model, options.folded);
  const levels = Math.max(1, ...shown.map((g) => g.depth + 1));
  const endpointX = GRAPH.x.group + levels * GRAPH.step;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const branches = new Map<string, GraphBranch>();
  let rows = 0;
  for (const source of model.sources) {
    const part = sourceGraph(source, rows, options, endpointX);
    nodes.push(...part.nodes);
    edges.push(...part.edges);
    for (const [key, branch] of part.branches) branches.set(key, branch);
    rows += part.rows;
  }
  const groupColumns = Array.from({ length: levels }, (_, depth) => ({
    x: GRAPH.x.group + depth * GRAPH.step,
    label: `${depth === 0 ? "Groups" : "Groups inside"} · ${shown.filter((g) => g.depth === depth).length}`,
  }));
  return {
    nodes,
    edges,
    branches,
    width: endpointX + GRAPH.width.endpoint + 4,
    height: GRAPH.top + rows * GRAPH.row + 12,
    columns: [
      { x: GRAPH.x.source, label: `Sources · ${model.sources.length}` },
      ...groupColumns,
      { x: endpointX, label: `Endpoints · ${model.endpoints.length}` },
    ],
  };
}
