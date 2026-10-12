import { STACKED, type TransportLayout, type TransportNode, WIDE } from "./transport-layouts"

const BEAM = "landing-beam fill-none stroke-brand drop-shadow-[0_0_3px_var(--color-brand)]"

const LABEL = "Clients connect through apiRoute() on your server to any REST backend"

function Node({ node, width, fontSize }: { node: TransportNode; width: number; fontSize: number }) {
  return (
    <g>
      <rect
        x={node.x}
        y={node.y}
        width={width}
        height="38"
        rx="9"
        className="fill-panel stroke-line-strong"
      />
      <text
        x={node.x + width / 2}
        y={node.y + 24}
        textAnchor="middle"
        fontSize={fontSize}
        className="fill-fg"
      >
        {node.label}
      </text>
    </g>
  )
}

function Drawing({ layout, className }: { layout: TransportLayout; className: string }) {
  const nodes = [...layout.clients, ...layout.backends]
  const { route, server, headings } = layout
  return (
    <svg viewBox={layout.viewBox} role="img" aria-label={LABEL} className={className}>
      {nodes.map((node) => (
        <path
          key={node.label}
          d={node.path}
          className="fill-none stroke-line-strong"
          strokeWidth="1.2"
        />
      ))}
      {nodes.map((node) => (
        <path
          key={`beam-${node.label}`}
          d={node.path}
          pathLength={100}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="18 82"
          className={BEAM}
          style={{ animationDelay: node.delay }}
        />
      ))}
      {nodes.map((node) => (
        <Node
          key={`node-${node.label}`}
          node={node}
          width={layout.nodeWidth}
          fontSize={layout.fontSize}
        />
      ))}
      <rect
        x={route.x}
        y={route.y}
        width="108"
        height="38"
        rx="9"
        className="fill-brand-dim stroke-brand"
      />
      <text
        x={route.x + 54}
        y={route.y + 24}
        textAnchor="middle"
        fontSize="13"
        className="fill-brand font-mono"
      >
        apiRoute()
      </text>
      <text
        x={server.x}
        y={server.y}
        textAnchor={server.anchor}
        fontSize="10.5"
        className="fill-fg-subtle font-mono"
      >
        your server
      </text>
      <text
        x={headings.clients[0]}
        y={headings.clients[1]}
        textAnchor="middle"
        fontSize="10.5"
        className="fill-fg-subtle font-mono"
      >
        CLIENTS
      </text>
      <text
        x={headings.backends[0]}
        y={headings.backends[1]}
        textAnchor="middle"
        fontSize="10.5"
        className="fill-fg-subtle font-mono"
      >
        ANY REST API
      </text>
    </svg>
  )
}

/**
 * Where the one route sits: clients of every kind on the left, the route on
 * your server in the middle, and any REST backend on the right, with calls
 * running through it. Where the drawing would be too narrow for its labels
 * to be read — on a phone — the clients sit above the route and the
 * backends below it instead.
 *
 * @returns The diagram
 * @example
 * ```tsx
 * <TransportDiagram />
 * ```
 */
export function TransportDiagram() {
  return (
    <div className="@container">
      <Drawing
        layout={WIDE}
        className="mx-auto hidden w-full max-w-[520px] overflow-visible @min-[352px]:block"
      />
      <Drawing
        layout={STACKED}
        className="mx-auto block w-full max-w-[360px] overflow-visible @min-[352px]:hidden"
      />
    </div>
  )
}
