const READERS = [
  { name: "<UserCard />", y: 24, path: "M112 40 C 134 40, 128 100, 150 100", delay: "0s" },
  { name: "<Sidebar />", y: 84, path: "M112 100 L 150 100", delay: "-0.6s" },
  { name: "<Header />", y: 144, path: "M112 160 C 134 160, 128 100, 150 100", delay: "-1.2s" },
]

const BEAM = "landing-beam fill-none stroke-(--tone) drop-shadow-[0_0_3px_var(--tone)]"

/**
 * Three components reading the same user: their reads meet at one query
 * key and leave as one request.
 *
 * @returns The diagram
 * @example
 * ```tsx
 * <DedupeDiagram />
 * ```
 */
export function DedupeDiagram() {
  return (
    <svg
      viewBox="0 0 360 200"
      role="img"
      aria-label="Three components read the same user; one request leaves"
      className="mx-auto block w-full max-w-[380px] overflow-visible font-mono"
    >
      {READERS.map((reader) => (
        <path
          key={reader.name}
          d={reader.path}
          className="fill-none stroke-line-strong"
          strokeWidth="1.2"
        />
      ))}
      <path d="M226 100 L 256 100" className="fill-none stroke-line-strong" strokeWidth="1.2" />
      {READERS.map((reader) => (
        <path
          key={`beam-${reader.name}`}
          d={reader.path}
          pathLength={100}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="22 78"
          className={BEAM}
          style={{ animationDuration: "1.8s", animationDelay: reader.delay }}
        />
      ))}
      <path
        d="M226 100 L 256 100"
        pathLength={100}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="40 60"
        className={BEAM}
        style={{ animationDuration: "1.2s" }}
      />
      {READERS.map((reader) => (
        <g key={`node-${reader.name}`}>
          <rect
            x="0"
            y={reader.y}
            width="112"
            height="32"
            rx="8"
            className="fill-panel stroke-line-strong"
          />
          <text
            x="56"
            y={reader.y + 20}
            textAnchor="middle"
            fontSize="11"
            className="fill-fg-muted"
          >
            {reader.name}
          </text>
        </g>
      ))}
      <rect
        x="150"
        y="84"
        width="76"
        height="32"
        rx="8"
        className="fill-[rgb(var(--tone-rgb)/0.1)] stroke-(--tone)"
      />
      <text x="188" y="104" textAnchor="middle" fontSize="11" className="fill-(--tone)">
        same key
      </text>
      <rect
        x="256"
        y="84"
        width="104"
        height="32"
        rx="8"
        className="fill-panel stroke-line-strong"
      />
      <text x="308" y="104" textAnchor="middle" fontSize="11" className="fill-fg">
        GET /users/5
      </text>
      <text x="188" y="146" textAnchor="middle" fontSize="10.5" className="fill-fg-subtle">
        3 reads → 1 request
      </text>
    </svg>
  )
}
