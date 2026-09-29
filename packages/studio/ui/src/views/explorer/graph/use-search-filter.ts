import type { Edge, Node } from "@xyflow/react";
import { useMemo } from "react";
import type { EndpointNodeData } from "../types";

interface SearchFilterResult {
  filteredNodes: Node[];
  filteredEdges: Edge[];
  matchCount: number;
}

/**
 * Dims non-matching nodes based on search endpoint.
 * Matches against endpoint method name, full path, group name, and source name.
 * Non-matching nodes get reduced opacity via className.
 */
export function useSearchFilter(nodes: Node[], edges: Edge[], search: string): SearchFilterResult {
  const query = search.trim().toLowerCase();

  return useMemo(() => {
    if (!query) {
      return {
        filteredNodes: nodes,
        filteredEdges: edges,
        matchCount: nodes.filter((n) => n.type === "endpoint").length,
      };
    }

    // Find matching endpoint node IDs
    const matchingIds = new Set<string>();
    let matchCount = 0;

    for (const node of nodes) {
      if (node.type === "endpoint") {
        const d = node.data as unknown as EndpointNodeData;
        const searchable =
          `${d.method} ${d.fullPath} ${d.httpMethod} ${d.group} ${d.source} ${d.endpointType}`.toLowerCase();
        if (searchable.includes(query)) {
          matchingIds.add(node.id);
          matchCount++;
        }
      }
    }

    // Find connected group and source IDs for matched endpoints
    const connectedIds = new Set(matchingIds);
    for (const edge of edges) {
      if (matchingIds.has(edge.target)) {
        connectedIds.add(edge.source);
      }
    }
    // Second pass: groups → sources
    for (const edge of edges) {
      if (connectedIds.has(edge.target) && !matchingIds.has(edge.target)) {
        connectedIds.add(edge.source);
      }
    }

    const filteredNodes = nodes.map((node) => ({
      ...node,
      style: {
        ...node.style,
        opacity: connectedIds.has(node.id) ? 1 : 0.15,
        transition: "opacity 200ms ease",
      },
    }));

    const filteredEdges = edges.map((edge) => ({
      ...edge,
      style: {
        ...edge.style,
        opacity: connectedIds.has(edge.source) && connectedIds.has(edge.target) ? 1 : 0.08,
        transition: "opacity 200ms ease",
      },
    }));

    return { filteredNodes, filteredEdges, matchCount };
  }, [nodes, edges, query]);
}
