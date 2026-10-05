const LEFT = [
  { label: "Browser", y: 30, path: "M112 49 C 146 49, 132 150, 166 150", delay: "0s" },
  { label: "Server comp.", y: 131, path: "M112 150 L 166 150", delay: "-0.8s" },
  { label: "Vue · Nuxt", y: 232, path: "M112 251 C 146 251, 132 150, 166 150", delay: "-1.6s" },
]
const RIGHT = [
  { label: "Express", y: 30, path: "M274 150 C 308 150, 294 49, 328 49", delay: "-1.2s" },
  { label: "FastAPI", y: 131, path: "M274 150 L 328 150", delay: "-2s" },
  { label: "Go · Rails", y: 232, path: "M274 150 C 308 150, 294 251, 328 251", delay: "-2.8s" },
]

const BEAM = "landing-beam fill-none stroke-brand drop-shadow-[0_0_3px_var(--color-brand)]"

function Node({ x, y, label }: { x: number; y: number; label: string }) {
  return (
    <g>
      <rect x={x} y={y} width="112" height="38" rx="9" className="fill-panel stroke-line-strong" />
      <text x={x + 56} y={y + 24} textAnchor="middle" fontSize="13" className="fill-fg">
        {label}
      </text>
    </g>
  )
}

/**
 * Where the one route sits: clients of every kind on the left, the route on
 * your server in the middle, and any REST backend on the right, with calls
 * running through it.
 *
 * @returns The diagram
 * @example
 * ```tsx
 * <TransportDiagram />
 * ```
 */
export function TransportDiagram() {
  const paths = [...LEFT, ...RIGHT]
  return (
    <svg
      viewBox="0 0 440 300"
      role="img"
      aria-label="Clients connect through apiRoute() on your server to any REST backend"
      className="mx-auto block w-full max-w-[520px] overflow-visible"
    >
      {paths.map((node) => (
        <path
          key={node.label}
          d={node.path}
          className="fill-none stroke-line-strong"
          strokeWidth="1.2"
        />
      ))}
      {paths.map((node) => (
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
      {LEFT.map((node) => (
        <Node key={`left-${node.label}`} x={0} y={node.y} label={node.label} />
      ))}
      {RIGHT.map((node) => (
        <Node key={`right-${node.label}`} x={328} y={node.y} label={node.label} />
      ))}
      <rect
        x="166"
        y="131"
        width="108"
        height="38"
        rx="9"
        className="fill-brand-dim stroke-brand"
      />
      <text x="220" y="155" textAnchor="middle" fontSize="13" className="fill-brand font-mono">
        apiRoute()
      </text>
      <text
        x="220"
        y="187"
        textAnchor="middle"
        fontSize="10.5"
        className="fill-fg-subtle font-mono"
      >
        your server
      </text>
      <text x="56" y="16" textAnchor="middle" fontSize="10.5" className="fill-fg-subtle font-mono">
        CLIENTS
      </text>
      <text x="384" y="16" textAnchor="middle" fontSize="10.5" className="fill-fg-subtle font-mono">
        ANY REST API
      </text>
    </svg>
  )
}
