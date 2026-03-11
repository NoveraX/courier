import type { RequestEntry, CompareTab } from "../../store"
import { Badge, formatDuration, formatSize } from "../../components/ui"
import { JsonTree } from "../../components/json-tree"

const TIMING_AMBER_MS = 200

export function ComparePanel({
  left,
  right,
  tab,
}: {
  left: RequestEntry
  right: RequestEntry
  tab: CompareTab
}) {
  return (
    <div className="grid flex-1 grid-cols-2 divide-x divide-border-default overflow-hidden">
      <div className="overflow-y-auto p-3">
        <CompareContent request={left} tab={tab} />
      </div>
      <div className="overflow-y-auto p-3">
        <CompareContent request={right} tab={tab} />
      </div>
    </div>
  )
}

function CompareContent({ request, tab }: { request: RequestEntry; tab: CompareTab }) {
  switch (tab) {
    case "payload":
      return (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Variables</div>
          {request.variables != null ? (
            <JsonTree data={request.variables} defaultExpanded={3} />
          ) : (
            <div className="text-[10px] text-text-muted">No variables</div>
          )}
        </div>
      )
    case "response":
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Response</div>
            <Badge variant={request.status === "success" ? "emerald" : "red"}>
              {request.statusCode ?? request.status}
            </Badge>
          </div>
          {request.data != null ? (
            <JsonTree data={request.data} defaultExpanded={3} />
          ) : request.error ? (
            <div className="rounded bg-red-500/10 p-2 text-[11px] text-red-400">{request.error.message}</div>
          ) : (
            <div className="text-[10px] text-text-muted">No response data</div>
          )}
        </div>
      )
    case "headers":
      return (
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Request Headers</div>
            <HeadersList headers={request.requestHeaders} />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Response Headers</div>
            <HeadersList headers={request.headers} />
          </div>
        </div>
      )
    case "timing":
      return <TimingCompare request={request} />
  }
}

function HeadersList({ headers }: { headers?: Record<string, string> }) {
  if (!headers || Object.keys(headers).length === 0) {
    return <div className="text-[10px] text-text-muted">No headers</div>
  }
  return (
    <div className="space-y-0.5">
      {Object.entries(headers).map(([key, value]) => (
        <div key={key} className="flex gap-2 font-mono text-[10px]">
          <span className="shrink-0 text-violet-400">{key}:</span>
          <span className="truncate text-text-secondary">{value}</span>
        </div>
      ))}
    </div>
  )
}

function TimingCompare({ request }: { request: RequestEntry }) {
  const t = request.timing
  if (!t) return <div className="text-[10px] text-text-muted">No timing data</div>

  const segments = [
    { label: "Total", value: t.total, color: "bg-text-secondary" },
    { label: "Middleware", value: t.middleware, color: "bg-violet-500" },
    { label: "Fetch", value: t.fetch, color: "bg-sky-500" },
    { label: "Validation", value: t.validation, color: "bg-emerald-500" },
  ]

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Timing Breakdown</div>
      {segments.map((seg) => (
        <div key={seg.label} className="flex items-center gap-2">
          <span className="w-20 text-[10px] text-text-muted">{seg.label}</span>
          <div className="h-3 flex-1 rounded bg-surface-1">
            <div
              className={`h-full rounded ${seg.color} opacity-70`}
              style={{ width: `${t.total > 0 ? (seg.value / t.total) * 100 : 0}%` }}
            />
          </div>
          <span className={`w-14 text-right text-[10px] ${seg.value > TIMING_AMBER_MS ? "text-amber-400" : "text-text-muted"}`}>
            {formatDuration(seg.value)}
          </span>
        </div>
      ))}
      {request.size != null && (
        <div className="mt-2 text-[10px] text-text-muted">Size: {formatSize(request.size)}</div>
      )}
    </div>
  )
}
