import "@xyflow/react/dist/base.css";

import type { NodeProps } from "@xyflow/react";
import { Background, BackgroundVariant, MiniMap, ReactFlow } from "@xyflow/react";
import { LEVEL_META } from "@/features/explorer/endpoint-metrics";
import type {
  CardNode,
  FlowNode,
  HeadingNode,
  RunningCalls,
  WiresNode,
} from "@/features/explorer/flow-nodes";
import { flowNodesOf } from "@/features/explorer/flow-nodes";
import type { GraphLayout, GraphNode } from "@/features/explorer/graph-types";
import { GraphControls } from "./graph-controls";
import { GraphNodeCard } from "./graph-node-card";
import { GRAPH_VIEW } from "./graph-view-options";
import { GraphWires } from "./graph-wires";

function Card({ data }: NodeProps<CardNode>): React.ReactNode {
  return <GraphNodeCard node={data.node} onHover={data.onHover} onOpen={data.onOpen} />;
}

function Heading({ data }: NodeProps<HeadingNode>): React.ReactNode {
  return (
    <span className="text-badge font-semibold whitespace-nowrap text-fg-subtle">{data.label}</span>
  );
}

function Wires({ data }: NodeProps<WiresNode>): React.ReactNode {
  return (
    <GraphWires
      edges={data.edges}
      pulses={data.pulses}
      onPulseDone={data.onPulseDone}
      width={data.width}
      height={data.height}
    />
  );
}

const NODE_TYPES = { card: Card, heading: Heading, wires: Wires };

const MINIMAP_FILL = {
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  err: "var(--color-err)",
  muted: "var(--color-fg-subtle)",
} as const;

/* A card's health on the minimap; the curves and the headings are not drawn there. */
function minimapFill(node: FlowNode): string {
  return node.type === "card" ? MINIMAP_FILL[LEVEL_META[node.data.node.level].tone] : "transparent";
}

interface GraphFlowProps {
  layout: GraphLayout;
  /** The calls running along the curves. */
  calls: RunningCalls;
  onHover: (id: string | undefined) => void;
  onOpen: (node: GraphNode) => void;
}

/**
 * The graph on a dotted ground that pans and zooms — dragged, scrolled with
 * a trackpad, pinched, or from the controls, which also fit it back in view
 * — with a minimap once it holds more than a screenful: column headings
 * over sources, groups and endpoints, the curves between them with the
 * calls running along them, a card a node.
 *
 * @param props - The layout, the calls running, and what hovering and opening a node do
 * @returns The canvas
 * @example
 * ```tsx
 * <GraphFlow layout={layout} onHover={setHover} onOpen={open} />
 * ```
 */
export function GraphFlow({ layout, calls, onHover, onOpen }: GraphFlowProps): React.ReactNode {
  const nodes = flowNodesOf(layout, { onHover, onOpen }, calls);
  return (
    <section
      aria-label="Endpoint graph"
      className="relative min-h-0 flex-1 [--xy-background-pattern-dots-color:var(--color-line)] [--xy-minimap-background-color:var(--color-panel)] [--xy-minimap-mask-background-color:color-mix(in_srgb,var(--color-bg)_55%,transparent)]"
    >
      <ReactFlow<FlowNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={GRAPH_VIEW.fit}
        minZoom={GRAPH_VIEW.zoom.min}
        maxZoom={GRAPH_VIEW.zoom.max}
        panOnScroll
        zoomOnPinch
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        colorMode="system"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <GraphControls />
        {layout.nodes.length > GRAPH_VIEW.minimapFrom && (
          <MiniMap<FlowNode>
            nodeColor={minimapFill}
            nodeStrokeWidth={0}
            pannable
            zoomable
            ariaLabel="Where the view is on the graph"
            className="overflow-hidden rounded-card border border-line"
          />
        )}
      </ReactFlow>
    </section>
  );
}
