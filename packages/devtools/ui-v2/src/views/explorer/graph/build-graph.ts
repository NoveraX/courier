import type { Node, Edge } from "@xyflow/react";
import type { ExplorerData } from "../use-explorer-data";
import type { SourceNodeData, GroupNodeData, EndpointNodeData, ExplorerEdgeData } from "../types";

// ── Builder ────────────────────────────────────────────────────────────────

/** Converts ExplorerData into React Flow nodes and edges */
export function buildFlowGraph(data: ExplorerData): {
  nodes: Node[];
  edges: Edge[];
} {
  const nodes: Node[] = [
    ...data.sources.map(buildSourceNode),
    ...data.groups.map(buildGroupNode),
    ...data.endpoints.map(buildEndpointNode),
  ];

  const edges: Edge[] = data.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothBezier",
    data: e.data satisfies ExplorerEdgeData,
  }));

  return { nodes, edges };
}

// ── Node builders ──────────────────────────────────────────────────────────

function buildSourceNode(src: SourceNodeData): Node {
  return {
    id: `source:${src.name}`,
    type: "source",
    position: { x: 0, y: 0 },
    data: src,
  };
}

function buildGroupNode(grp: GroupNodeData): Node {
  return {
    id: `group:${grp.source}.${grp.name}`,
    type: "group",
    position: { x: 0, y: 0 },
    data: grp,
  };
}

function buildEndpointNode(ep: EndpointNodeData): Node {
  return {
    id: `endpoint:${ep.source}.${ep.group}.${ep.method}`,
    type: "endpoint",
    position: { x: 0, y: 0 },
    data: ep,
  };
}
