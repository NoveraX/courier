const CELLS = [
  { label: "Status", value: "201 Created", tone: "text-ok" },
  { label: "Duration", value: "164ms", tone: "text-fg" },
  { label: "Size", value: "1.8 KB", tone: "text-fg" },
  { label: "Mode", value: "proxy", tone: "text-tone-teal" },
]

const PHASES = [
  { label: "Middleware", left: "0%", width: "10%", tone: "bg-tone-violet" },
  { label: "Fetch", left: "10%", width: "76%", tone: "bg-tone-blue" },
  { label: "Validation", left: "86%", width: "6%", tone: "bg-tone-amber" },
  {
    label: "Logger",
    left: "92%",
    width: "8%",
    tone: "bg-[color-mix(in_srgb,var(--color-tone-violet)_55%,var(--color-bg))]",
  },
]

/**
 * The Studio window's detail panel: one call's status, duration, size and
 * mode, its timing by phase, and its response.
 *
 * @returns The panel
 * @example
 * ```tsx
 * <WindowDetail />
 * ```
 */
export function WindowDetail() {
  return (
    <div className="hidden flex-col gap-3 border-l border-line bg-panel p-3.5 min-[760px]:flex">
      <div className="flex items-center gap-1.5">
        <span className="flex h-4.5 items-center rounded-[4px] bg-tone-green/13 px-1.5 font-mono text-[9.5px] font-semibold text-tone-green">
          POST
        </span>
        <span className="font-mono text-small">
          <span className="text-fg-subtle">api.</span>orders.create
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[9px] border border-line bg-line">
        {CELLS.map((cell) => (
          <div key={cell.label} className="flex flex-col gap-0.75 bg-inset px-2.25 py-1.75">
            <span className="text-[9.5px] text-fg-subtle">{cell.label}</span>
            <span className={`font-mono text-label ${cell.tone}`}>{cell.value}</span>
          </div>
        ))}
      </div>
      <span className="text-micro font-semibold text-fg-muted">Timing</span>
      <div className="flex flex-col gap-1.5">
        {PHASES.map((phase) => (
          <div
            key={phase.label}
            className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-2 text-micro text-fg-subtle"
          >
            <span>{phase.label}</span>
            <span className="relative h-1.75 rounded-[2px] bg-raised">
              <span
                className={`absolute inset-y-0 rounded-[2px] ${phase.tone}`}
                style={{ left: phase.left, width: phase.width }}
              />
            </span>
          </div>
        ))}
      </div>
      <span className="text-micro font-semibold text-fg-muted">Response</span>
      <pre className="m-0 overflow-hidden rounded-control border border-line bg-inset px-2.5 py-2 text-micro leading-[1.6]">
        <span className="text-fg-subtle">{"{"}</span>
        {"\n  "}
        <span className="text-tone-blue">"id"</span>
        <span className="text-fg-subtle">:</span> <span className="text-tone-green">"ord_7Q2"</span>
        <span className="text-fg-subtle">,</span>
        {"\n  "}
        <span className="text-tone-blue">"status"</span>
        <span className="text-fg-subtle">:</span> <span className="text-tone-green">"pending"</span>
        <span className="text-fg-subtle">,</span>
        {"\n  "}
        <span className="text-tone-blue">"total"</span>
        <span className="text-fg-subtle">:</span> <span className="text-tone-amber">129.4</span>
        {"\n"}
        <span className="text-fg-subtle">{"}"}</span>
      </pre>
    </div>
  )
}
