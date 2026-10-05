import type { GraphEdge } from "@/features/explorer/graph-types";
import { cn } from "@/lib/utils";

const EDGE_STROKE: Readonly<Record<GraphEdge["tone"], string>> = {
  err: "stroke-err",
  live: "stroke-brand",
  plain: "stroke-line-strong",
};

interface GraphWiresProps {
  edges: readonly GraphEdge[];
  width: number;
  height: number;
}

/**
 * The curves from every parent to every child on the Explorer's graph —
 * red where a child errs, blue while it is active, dashed and moving while
 * traffic flows, as wide as its calls a minute, faded off the hovered
 * branch — drawn under the nodes, in the graph's own coordinates.
 *
 * @param props - The curves, and the size of the graph they span
 * @returns The curves
 * @example
 * ```tsx
 * <GraphWires edges={layout.edges} width={layout.width} height={layout.height} />
 * ```
 */
export function GraphWires({ edges, width, height }: GraphWiresProps): React.ReactNode {
  return (
    <svg aria-hidden="true" width={width} height={height} className="overflow-visible">
      {edges.map((edge) => (
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
  );
}
