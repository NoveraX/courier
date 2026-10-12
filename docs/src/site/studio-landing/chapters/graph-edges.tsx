import { cn } from "@/site/cn"
import type { GraphLayout } from "./graph-model"
import { edgePath, GRAPH_EDGES, GRAPH_NODES } from "./graph-model"
import { stagger } from "./stagger"

/**
 * The graph's edges: each drawn in, the busiest dashed and flowing, red
 * toward a failing endpoint, with calls travelling along them.
 *
 * @param props - The layout the graph is drawn in
 * @returns The edges
 * @example
 * ```tsx
 * <GraphEdges layout={WIDE_GRAPH} />
 * ```
 */
export function GraphEdges({ layout }: { layout: GraphLayout }) {
  const size = { width: layout.width, height: layout.height }
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="absolute inset-0"
      style={size}
    >
      {GRAPH_EDGES.map((edge, at) => {
        const failing = GRAPH_NODES[edge[1]]?.health === "err"
        const moving = at % 3 === 0
        const tone = failing ? "stroke-err" : moving ? "stroke-brand" : "stroke-line-strong"
        const enter = GRAPH_NODES[edge[0]]?.kind === "source" ? at % 3 : 3 + (at % 4)
        return (
          <g key={edge.join("-")}>
            <path
              data-a={moving ? "flow" : "draw"}
              style={stagger(enter)}
              pathLength={moving ? undefined : 1}
              d={edgePath(edge, layout)}
              className={cn("fill-none", tone)}
              strokeWidth="1.5"
              strokeDasharray={moving ? "5 5" : undefined}
            />
            {[0, 1].map((dot) => (
              <circle
                key={dot}
                data-a="fade"
                style={stagger(enter + 6)}
                r="2.6"
                className={failing ? "fill-err" : "fill-brand"}
              >
                <animateMotion
                  dur={`${1.8 + (at % 3) * 0.4}s`}
                  begin={`${at * 0.37 + dot * (0.9 + (at % 3) * 0.2)}s`}
                  repeatCount="indefinite"
                  path={edgePath(edge, layout)}
                />
              </circle>
            ))}
          </g>
        )
      })}
    </svg>
  )
}
