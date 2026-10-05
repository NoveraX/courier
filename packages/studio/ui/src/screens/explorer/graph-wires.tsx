import type { Pulse } from "@/features/explorer/call-pulses";
import type { GraphEdge } from "@/features/explorer/graph-types";
import { cn } from "@/lib/utils";
import { GraphPulses } from "./graph-pulses";

const EDGE_STROKE: Readonly<Record<GraphEdge["tone"], string>> = {
  err: "stroke-err",
  live: "stroke-brand",
  plain: "stroke-line-strong",
};

interface GraphWiresProps {
  edges: readonly GraphEdge[];
  pulses: readonly Pulse[];
  onPulseDone: (id: string) => void;
  width: number;
  height: number;
}

/**
 * The curves from every parent to every child on the Explorer's graph —
 * thin, red where a child errs, blue while it is active, faded off the
 * hovered branch — and the calls running along them, drawn under the
 * nodes, in the graph's own coordinates.
 *
 * @param props - The curves, the calls running, what one that ran calls, and the graph's size
 * @returns The curves and the calls
 * @example
 * ```tsx
 * <GraphWires edges={layout.edges} pulses={pulses} onPulseDone={done} width={layout.width} height={layout.height} />
 * ```
 */
export function GraphWires({
  edges,
  pulses,
  onPulseDone,
  width,
  height,
}: GraphWiresProps): React.ReactNode {
  return (
    <svg aria-hidden="true" width={width} height={height} className="overflow-visible">
      {edges.map((edge) => (
        <path
          key={edge.id}
          d={edge.path}
          fill="none"
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeOpacity={edge.opacity}
          className={cn("transition-[stroke-opacity] duration-150", EDGE_STROKE[edge.tone])}
        />
      ))}
      <GraphPulses pulses={pulses} onDone={onPulseDone} />
    </svg>
  );
}
