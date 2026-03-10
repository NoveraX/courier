import { useState, useMemo } from "react"
import { ArrowLeftRight, X } from "lucide-react"

import type { RequestEntry } from "../../store"
import { useDevToolsStore } from "../../store"
import { Badge, formatDuration, formatSize } from "../../components/ui"
import { JsonTree } from "../../components/json-tree"
import { STATUS_CONFIG, HTTP_METHOD_COLORS } from "../timeline/constants"

type CompareTab = "payload" | "response" | "headers" | "timing"

const COMPARE_TABS: { id: CompareTab; label: string }[] = [
  { id: "payload", label: "Payload" },
  { id: "response", label: "Response" },
  { id: "headers", label: "Headers" },
  { id: "timing", label: "Timing" },
]

// ── Compare View ────────────────────────────────────────────────────────────

export function CompareView() {
  const { requests } = useDevToolsStore()
  const [leftId, setLeftId] = useState<string | null>(null)
  const [rightId, setRightId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CompareTab>("response")
  const [pickerSide, setPickerSide] = useState<"left" | "right" | null>(null)

  const completed = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  )

  const leftReq = useMemo(() => completed.find((r) => r.id === leftId) ?? null, [completed, leftId])
  const rightReq = useMemo(() => completed.find((r) => r.id === rightId) ?? null, [completed, rightId])

  function handleSelect(id: string) {
    if (pickerSide === "left") setLeftId(id)
    else if (pickerSide === "right") setRightId(id)
    setPickerSide(null)
  }

  // If neither selected, show picker for both
  if (!leftReq && !rightReq) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-text-muted">
          <ArrowLeftRight size={36} strokeWidth={1} />
          <p className="text-sm">Select two requests to compare</p>
          <p className="text-xs">Pick from the list below</p>
        </div>
        <RequestPicker requests={completed} onSelect={(id) => { setLeftId(id); setPickerSide("right") }} selectedIds={[]} />
      </div>
    )
  }

  if (leftReq && !rightReq) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-default px-3 py-2">
          <RequestTag request={leftReq} />
          <span className="text-text-muted">vs</span>
          <span className="text-[11px] text-text-muted">Select second request...</span>
        </div>
        <RequestPicker requests={completed} onSelect={(id) => setRightId(id)} selectedIds={[leftId!]} />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header with selections */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-default px-3 py-1.5">
        <div className="flex items-center gap-2">
          {/* Left slot */}
          <button type="button" onClick={() => setPickerSide(pickerSide === "left" ? null : "left")} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-1">
            {leftReq ? <RequestTag request={leftReq} /> : <span className="text-[11px] text-text-muted">Select...</span>}
          </button>

          <ArrowLeftRight size={14} className="text-text-muted" />

          {/* Right slot */}
          <button type="button" onClick={() => setPickerSide(pickerSide === "right" ? null : "right")} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-surface-1">
            {rightReq ? <RequestTag request={rightReq} /> : <span className="text-[11px] text-text-muted">Select...</span>}
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-1 p-0.5">
          {COMPARE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                activeTab === tab.id ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Clear */}
        <button type="button" onClick={() => { setLeftId(null); setRightId(null) }} className="rounded p-1 text-text-muted hover:bg-surface-1 hover:text-text-secondary">
          <X size={14} />
        </button>
      </div>

      {/* Picker dropdown */}
      {pickerSide && (
        <RequestPicker
          requests={completed}
          onSelect={handleSelect}
          selectedIds={[leftId, rightId].filter(Boolean) as string[]}
        />
      )}

      {/* Comparison content */}
      {leftReq && rightReq && !pickerSide && (
        <div className="flex flex-1 overflow-hidden">
          <ComparePanel left={leftReq} right={rightReq} tab={activeTab} />
        </div>
      )}
    </div>
  )
}

// ── Request Tag ─────────────────────────────────────────────────────────────

function RequestTag({ request }: { request: RequestEntry }) {
  const label = [request.source, request.group, request.method].filter(Boolean).join(".")
  const statusCfg = STATUS_CONFIG[request.status]
  const methodColor = HTTP_METHOD_COLORS[request.httpMethod ?? "GET"] ?? "text-text-secondary"

  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
      <span className={`text-[10px] font-medium ${methodColor}`}>{request.httpMethod ?? "GET"}</span>
      <span className="font-mono text-[10px] text-text-secondary">{label}</span>
      {request.statusCode && (
        <span className="text-[10px] text-text-muted">{request.statusCode}</span>
      )}
    </div>
  )
}

// ── Request Picker ──────────────────────────────────────────────────────────

function RequestPicker({
  requests,
  onSelect,
  selectedIds,
}: {
  requests: RequestEntry[]
  onSelect: (id: string) => void
  selectedIds: string[]
}) {
  return (
    <div className="max-h-64 flex-1 overflow-y-auto border-b border-border-default">
      {requests.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-[11px] text-text-muted">No completed requests</div>
      ) : (
        requests.map((r) => {
          const label = [r.source, r.group, r.method].filter(Boolean).join(".")
          const isSelected = selectedIds.includes(r.id)
          const statusCfg = STATUS_CONFIG[r.status]
          const methodColor = HTTP_METHOD_COLORS[r.httpMethod ?? "GET"] ?? "text-text-secondary"
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect(r.id)}
              className={`flex w-full items-center gap-2 border-b border-border-subtle px-3 py-1.5 text-left transition-colors hover:bg-surface-1 ${isSelected ? "bg-surface-1 opacity-50" : ""}`}
              disabled={isSelected}
            >
              <div className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotClass}`} />
              <span className={`text-[10px] font-medium ${methodColor}`}>{r.httpMethod ?? "GET"}</span>
              <span className="flex-1 truncate font-mono text-[11px] text-text-secondary">{label}</span>
              <span className="text-[10px] text-text-muted">{r.statusCode ?? "—"}</span>
              <span className="text-[10px] text-text-muted">{r.timing ? formatDuration(r.timing.total) : "—"}</span>
            </button>
          )
        })
      )}
    </div>
  )
}

// ── Compare Panel ───────────────────────────────────────────────────────────

function ComparePanel({
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
            <div className="rounded bg-red-500/10 p-2 text-[11px] text-red-400">
              {request.error.message}
            </div>
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
          <span className={`w-14 text-right text-[10px] ${seg.value > 200 ? "text-amber-400" : "text-text-muted"}`}>
            {formatDuration(seg.value)}
          </span>
        </div>
      ))}
      {request.size != null && (
        <div className="mt-2 text-[10px] text-text-muted">
          Size: {formatSize(request.size)}
        </div>
      )}
    </div>
  )
}
