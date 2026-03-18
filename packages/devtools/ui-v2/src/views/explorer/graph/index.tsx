import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from "@xyflow/react";
import type { Node, NodeMouseHandler } from "@xyflow/react";
import "@xyflow/react/dist/base.css";

import { useExplorerData } from "../use-explorer-data";
import { useExplorerNavigation } from "../use-explorer-navigation";
import { useExplorerSearch } from "../use-explorer-search";
import { buildFlowGraph } from "./build-graph";
import { computeLayout } from "./layout-engine";
import { useGraphDimming } from "./use-graph-dimming";
import { useSearchFilter } from "./use-search-filter";
import { SourceNode } from "./nodes/source-node";
import { GroupNode } from "./nodes/group-node";
import { EndpointNode } from "./nodes/endpoint-node";
import { AnimatedEdge } from "./edges/animated-edge";
import { EdgeDefinitions } from "./edges/edge-definitions";
import { GraphToolbar } from "./controls/graph-toolbar";
import { GraphLegend } from "./controls/graph-legend";
import { GraphMinimap } from "./controls/graph-minimap";
import { EndpointPanel } from "../detail/endpoint-panel";
import { formatEndpointKey } from "../helpers";
import { EmptyState } from "@/components/shared/empty-state";
import { Network } from "lucide-react";

import "./graph-styles.css";

// ── Node & edge types (MUST be outside component to avoid re-renders) ──────

const nodeTypes = { source: SourceNode, group: GroupNode, endpoint: EndpointNode };
const edgeTypes = { smoothBezier: AnimatedEdge };

// ── Component ──────────────────────────────────────────────────────────────

export function ExplorerGraph(): React.ReactElement {
  const data = useExplorerData();
  const explorerSearch = useExplorerSearch();
  const { navigateToTimeline, openPlayground } = useExplorerNavigation();
  const { fitView } = useReactFlow();

  const {
    layout, search, showMinimap, metricMode,
    setLayout, setSearch, selectEndpoint, setMetricMode, toggleMinimap,
  } = explorerSearch;

  // Build & layout nodes
  const { initialNodes, initialEdges } = useMemo(() => {
    const { nodes: raw, edges } = buildFlowGraph(data);
    const laid = computeLayout(raw, edges, { direction: layout });
    return { initialNodes: laid, initialEdges: edges };
  }, [data, layout]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when data/layout changes
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 50);
  }, [initialNodes, initialEdges, setNodes, setEdges, fitView]);

  // Search filtering (dims non-matching nodes)
  const { filteredNodes, filteredEdges, matchCount } = useSearchFilter(nodes, edges, search);

  // BFS hover dimming
  const { onNodeMouseEnter, onNodeMouseLeave } = useGraphDimming(setNodes, setEdges, edges);

  // Click handlers
  const onNodeClick: NodeMouseHandler = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === "endpoint") {
        const d = node.data as { source: string; group: string; method: string };
        selectEndpoint(formatEndpointKey(d.source, d.group, d.method));
      }
    },
    [selectEndpoint],
  );

  const onPaneClick = useCallback(() => selectEndpoint(null), [selectEndpoint]);

  const endpointCount = data.endpoints.length;

  if (data.isEmpty) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <EmptyState
          icon={Network}
          heading="No API sources"
          description="Connect your app to see the API topology graph"
        />
      </div>
    );
  }

  return (
    <div className="explorer-graph relative min-h-0 flex-1">
      <GraphToolbar
        search={search}
        onSearchChange={setSearch}
        layout={layout}
        onLayoutChange={setLayout}
        metricMode={metricMode}
        onMetricModeChange={setMetricMode}
        showMinimap={showMinimap}
        onToggleMinimap={toggleMinimap}
        endpointCount={endpointCount}
        matchCount={search ? matchCount : null}
      />

      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onPaneClick={onPaneClick}
        colorMode="dark"
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{ type: "smoothBezier" }}
        proOptions={{ hideAttribution: true }}
      >
        <EdgeDefinitions />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--graph-dot-color)" />
        {showMinimap && <GraphMinimap />}
      </ReactFlow>

      <GraphLegend />

      <EndpointPanel
        selectedKey={explorerSearch.selectedEndpoint}
        onClose={() => selectEndpoint(null)}
        onNavigateToTimeline={navigateToTimeline}
        onOpenPlayground={openPlayground}
      />
    </div>
  );
}
