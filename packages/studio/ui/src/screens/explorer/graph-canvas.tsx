import type { GraphEdge, GraphLayout, GraphNode } from "@/features/explorer/graph-types";
import { cn } from "@/lib/utils";
import { GraphNodeCard } from "./graph-node-card";

const EDGE_STROKE: Readonly<Record<GraphEdge["tone"], string>> = {
  err: "stroke-err",
  live: "stroke-brand",
  plain: "stroke-line-strong",
};

interface GraphCanvasProps {
  layout: GraphLayout;
  onHover: (id: string | undefined) => void;
  onOpen: (node: GraphNode) => void;
}

/**
 * The graph itself, on a dotted ground: a column heading over sources,
 * groups and endpoints, a curve from each parent to each child — dashed
 * and moving while traffic flows — and a card per node.
 *
 * @param props - The layout, and what hovering and opening a node do
 * @returns The canvas, scrolling when the graph outgrows it
 * @example
 * ```tsx
 * <GraphCanvas layout={layout} onHover={setHover} onOpen={open} />
 * ```
 */
export function GraphCanvas({ layout, onHover, onOpen }: GraphCanvasProps): React.ReactNode {
  return (
    <section
      aria-label="Endpoint graph"
      className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle,var(--color-line)_1px,transparent_1.2px)] bg-size-[18px_18px]"
    >
      <div className="relative mx-auto" style={{ width: layout.width, height: layout.height }}>
        {layout.columns.map((column) => (
          <span
            key={column.label}
            className="absolute top-4 text-badge font-semibold text-fg-subtle"
            style={{ left: column.x }}
          >
            {column.label}
          </span>
        ))}
        <svg
          aria-hidden="true"
          width={layout.width}
          height={layout.height}
          className="absolute inset-0 overflow-visible"
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              strokeWidth={edge.width}
              strokeOpacity={edge.opacity}
              strokeDasharray={edge.moving ? "5 5" : undefined}
              className={cn(
                "transition-[stroke-opacity] duration-150",
                EDGE_STROKE[edge.tone],
                edge.moving && "animate-dash-flow",
              )}
            />
          ))}
        </svg>
        {layout.nodes.map((node) => (
          <GraphNodeCard key={node.id} node={node} onHover={onHover} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
