import dagre from "dagre";
import type { Node, Edge } from "@xyflow/react";
import type { ExplorerLayout } from "../types";
import { LAYOUT_CONFIG, NODE_DIMENSIONS } from "../constants";

// ── Types ──────────────────────────────────────────────────────────────────

interface LayoutOptions {
  direction: ExplorerLayout;
}

type NodeType = "source" | "group" | "endpoint";

// ── Layout computation ─────────────────────────────────────────────────────

/** Applies dagre hierarchical layout to React Flow nodes */
export function computeLayout(
  nodes: Node[],
  edges: Edge[],
  { direction }: LayoutOptions,
): Node[] {
  const g = new dagre.graphlib.Graph();

  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    ranksep: LAYOUT_CONFIG.rankSep,
    nodesep: LAYOUT_CONFIG.nodeSep,
    marginx: LAYOUT_CONFIG.marginX,
    marginy: LAYOUT_CONFIG.marginY,
  });

  for (const node of nodes) {
    const dims = getDimensions(node.type as NodeType);
    g.setNode(node.id, { width: dims.width, height: dims.height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const dims = getDimensions(node.type as NodeType);

    return {
      ...node,
      position: {
        x: pos.x - dims.width / 2,
        y: pos.y - dims.height / 2,
      },
    };
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getDimensions(type: NodeType): { width: number; height: number } {
  return NODE_DIMENSIONS[type] ?? NODE_DIMENSIONS.endpoint;
}
