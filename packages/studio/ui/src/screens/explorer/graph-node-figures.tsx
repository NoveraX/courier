import { TONE_TEXT } from "@/design/tone";
import type { GraphNode } from "@/features/explorer/graph-types";

/**
 * What a hovered graph node adds up to, over its card: its whole address —
 * a source's base URL, an endpoint's method and path, a group's name — and
 * its calls a minute, median and p95 durations and share of failures. The
 * card's own name carries the same for a screen reader.
 *
 * @param props - The node
 * @returns The figures
 * @example
 * ```tsx
 * {node.hovered && <GraphNodeFigures node={node} />}
 * ```
 */
export function GraphNodeFigures({ node }: { node: GraphNode }): React.ReactNode {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full left-0 mb-2 flex w-max max-w-90 min-w-full animate-pop-in flex-col gap-2 rounded-card border border-line bg-panel px-3 py-2.5 text-left shadow-node-lift"
    >
      <span className="font-mono text-meta break-all text-fg">{node.detail}</span>
      {node.figures.length > 0 ? (
        <span className="grid grid-cols-4 gap-x-4 gap-y-1">
          {node.figures.map((figure) => (
            <span key={figure.label} className="flex flex-col gap-0.5">
              <span className="text-badge whitespace-nowrap text-fg-subtle">{figure.label}</span>
              <span className={`font-mono text-meta whitespace-nowrap ${TONE_TEXT[figure.tone]}`}>
                {figure.value}
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="text-meta text-fg-subtle">No calls yet</span>
      )}
    </span>
  );
}
