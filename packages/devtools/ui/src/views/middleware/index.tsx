import { useState, useMemo } from "react"
import { ChevronDown, ChevronRight, AlertTriangle, Zap, RotateCcw, Database } from "lucide-react"

import type { RequestEntry } from "../../store"
import { useDevToolsStore } from "../../store"
import { Badge, formatDuration } from "../../components/ui"

// ── Types ───────────────────────────────────────────────────────────────────

interface MiddlewareStep {
  name: string
  index: number
  duration: number
  phase: "request" | "response"
  headersAdded?: string[]
  hasError?: boolean
  isCacheHit?: boolean
  isRetry?: boolean
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function estimateMiddlewareSteps(r: RequestEntry): MiddlewareStep[] {
  if (r.middlewareCount === 0 || !r.timing) return []

  const perMiddleware = r.timing.middleware / Math.max(r.middlewareCount * 2, 1)
  const steps: MiddlewareStep[] = []
  const middlewareHeaders = r.middlewareHeaders ?? {}

  for (let i = 0; i < r.middlewareCount; i++) {
    const name = guessMiddlewareName(i, middlewareHeaders)
    const headersAdded = Object.entries(middlewareHeaders)
      .filter(([, sources]) => sources.includes(name))
      .map(([header]) => header)

    steps.push({
      name,
      index: i,
      duration: perMiddleware,
      phase: "request",
      headersAdded: headersAdded.length > 0 ? headersAdded : undefined,
      isCacheHit: name.toLowerCase().includes("cache") && r.timing.fetch === 0,
    })
  }

  // Add response-phase (reverse order)
  for (let i = r.middlewareCount - 1; i >= 0; i--) {
    const reqStep = steps[i]!
    steps.push({
      name: reqStep.name,
      index: i,
      duration: perMiddleware,
      phase: "response",
      hasError: i === r.middlewareCount - 1 && r.status === "error",
    })
  }

  return steps
}

function guessMiddlewareName(
  index: number,
  headers: Record<string, string[]>,
): string {
  const knownNames = ["auth", "rateLimit", "retry", "log", "cache"]
  // Try to infer from middleware headers
  const headerSources = new Set(Object.values(headers).flat())
  for (const name of headerSources) {
    if (!knownNames.includes(name)) knownNames.push(name)
  }
  if (index < knownNames.length) return knownNames[index]!
  return `middleware_${index}`
}

function getOverheadPercent(r: RequestEntry): number {
  if (!r.timing || r.timing.total === 0) return 0
  return (r.timing.middleware / r.timing.total) * 100
}

// ── Aggregate stats ─────────────────────────────────────────────────────────

interface MiddlewareStats {
  name: string
  calls: number
  avgDuration: number
  maxDuration: number
  errors: number
}

function computeAggregateStats(requests: RequestEntry[]): MiddlewareStats[] {
  const map = new Map<string, { total: number; max: number; count: number; errors: number }>()

  for (const r of requests) {
    if (r.middlewareCount === 0 || !r.timing) continue
    const perMw = r.timing.middleware / Math.max(r.middlewareCount, 1)
    const mwHeaders = r.middlewareHeaders ?? {}

    for (let i = 0; i < r.middlewareCount; i++) {
      const name = guessMiddlewareName(i, mwHeaders)
      const entry = map.get(name) ?? { total: 0, max: 0, count: 0, errors: 0 }
      entry.total += perMw
      entry.max = Math.max(entry.max, perMw)
      entry.count += 1
      if (r.status === "error") entry.errors += 1
      map.set(name, entry)
    }
  }

  return Array.from(map, ([name, s]) => ({
    name,
    calls: s.count,
    avgDuration: s.total / s.count,
    maxDuration: s.max,
    errors: s.errors,
  })).sort((a, b) => b.avgDuration - a.avgDuration)
}

// ── Middleware Inspector View ────────────────────────────────────────────────

export function MiddlewareView() {
  const { requests } = useDevToolsStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showStats, setShowStats] = useState(false)

  const requestsWithMiddleware = useMemo(
    () => requests.filter((r) => r.middlewareCount > 0 && r.status !== "pending"),
    [requests],
  )

  const aggregateStats = useMemo(() => computeAggregateStats(requestsWithMiddleware), [requestsWithMiddleware])

  const selectedRequest = useMemo(
    () => requestsWithMiddleware.find((r) => r.id === selectedId) ?? null,
    [requestsWithMiddleware, selectedId],
  )

  if (requestsWithMiddleware.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-text-muted">
        <Zap size={32} strokeWidth={1} />
        <p className="text-sm">No middleware activity</p>
        <p className="text-xs">Requests with middleware will appear here</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Request list (left) */}
      <div className="flex w-[280px] shrink-0 flex-col border-r border-border-default">
        {/* Toggle header */}
        <div className="flex items-center justify-between border-b border-border-default px-3 py-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
            Requests ({requestsWithMiddleware.length})
          </span>
          <button
            type="button"
            onClick={() => setShowStats((s) => !s)}
            className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${showStats ? "bg-surface-2 text-text-primary" : "text-text-muted hover:text-text-secondary"}`}
          >
            Stats
          </button>
        </div>

        {showStats ? (
          <AggregateStatsPanel stats={aggregateStats} />
        ) : (
          <div className="flex-1 overflow-y-auto">
            {requestsWithMiddleware.map((r) => {
              const label = [r.source, r.group, r.method].filter(Boolean).join(".")
              const overhead = getOverheadPercent(r)
              const isSelected = r.id === selectedId
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2 text-left transition-colors hover:bg-surface-1 ${isSelected ? "bg-surface-1" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-[11px] text-text-secondary">{label}</div>
                    <div className="flex items-center gap-2 text-[10px] text-text-muted">
                      <span>{r.middlewareCount} middleware</span>
                      <span>{formatDuration(r.timing?.middleware ?? 0)}</span>
                      <span className={overhead > 20 ? "text-amber-400" : ""}>{overhead.toFixed(0)}% overhead</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Chain visualization (right) */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {selectedRequest ? (
          <MiddlewareChain request={selectedRequest} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[11px] text-text-muted">
            Select a request to inspect middleware chain
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chain Visualization ─────────────────────────────────────────────────────

function MiddlewareChain({ request }: { request: RequestEntry }) {
  const steps = useMemo(() => estimateMiddlewareSteps(request), [request])
  const label = [request.source, request.group, request.method].filter(Boolean).join(".")
  const overhead = getOverheadPercent(request)

  const requestPhase = steps.filter((s) => s.phase === "request")
  const responsePhase = steps.filter((s) => s.phase === "response")

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-text-primary">{label}</span>
          <Badge variant={request.status === "success" ? "emerald" : "red"}>
            {request.status}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-text-muted">
          <span>Total: {formatDuration(request.timing?.total ?? 0)}</span>
          <span>Middleware: {formatDuration(request.timing?.middleware ?? 0)}</span>
          <span className={overhead > 20 ? "text-amber-400" : ""}>
            Overhead: {overhead.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Divider bar */}
      <div className="mb-4 h-px bg-border-default" />

      {/* Request phase (down) */}
      <div className="space-y-0">
        {requestPhase.map((step, i) => (
          <MiddlewareStepNode key={`req-${step.index}`} step={step} isFirst={i === 0} isLast={false} direction="down" />
        ))}
      </div>

      {/* Fetch separator */}
      <div className="my-1 ml-4 flex items-center gap-2">
        <div className="h-4 w-px bg-sky-500/50" />
      </div>
      <div className="ml-2 flex items-center gap-2 rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2">
        <div className="h-2 w-2 rounded-full bg-sky-500" />
        <span className="text-[11px] font-medium text-sky-400">fetch()</span>
        <span className="text-[10px] text-text-muted">{formatDuration(request.timing?.fetch ?? 0)}</span>
        {request.timing?.fetch === 0 && (
          <Badge variant="emerald">cache hit</Badge>
        )}
      </div>
      <div className="my-1 ml-4 flex items-center gap-2">
        <div className="h-4 w-px bg-sky-500/50" />
      </div>

      {/* Response phase (up) */}
      <div className="space-y-0">
        {responsePhase.map((step, i) => (
          <MiddlewareStepNode key={`res-${step.index}`} step={step} isFirst={false} isLast={i === responsePhase.length - 1} direction="up" />
        ))}
      </div>

      {/* Summary bar */}
      <div className="mt-4 h-px bg-border-default" />
      <div className="mt-2 text-[11px] text-text-muted">
        Total middleware overhead: {formatDuration(request.timing?.middleware ?? 0)} ({overhead.toFixed(1)}% of total)
      </div>
    </div>
  )
}

// ── Middleware Step Node ─────────────────────────────────────────────────────

function MiddlewareStepNode({
  step,
  isFirst: _isFirst,
  isLast: _isLast,
  direction,
}: {
  step: MiddlewareStep
  isFirst: boolean
  isLast: boolean
  direction: "down" | "up"
}) {
  const [expanded, setExpanded] = useState(false)
  const arrow = direction === "down" ? "→" : "←"
  const isSlow = step.duration > 5

  return (
    <div className="ml-2">
      {/* Connector line */}
      <div className="ml-2 h-2 w-px bg-violet-500/30" />

      {/* Step */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-surface-1"
      >
        {expanded ? <ChevronDown size={12} className="shrink-0 text-text-muted" /> : <ChevronRight size={12} className="shrink-0 text-text-muted" />}
        <span className="text-[11px] text-violet-400">{arrow}</span>
        <span className="text-[11px] font-medium text-text-secondary">{step.name}</span>
        <span className={`text-[10px] ${isSlow ? "text-amber-400" : "text-text-muted"}`}>
          {formatDuration(step.duration)}
        </span>
        {step.isCacheHit && <Database size={10} className="text-emerald-400" />}
        {step.isRetry && <RotateCcw size={10} className="text-amber-400" />}
        {step.hasError && <AlertTriangle size={10} className="text-red-400" />}
        {step.duration === 0 && <span className="text-[9px] text-text-muted">(passthrough)</span>}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="ml-8 space-y-1 py-1">
          <div className="text-[10px] text-text-muted">
            Phase: {step.phase} | Index: {step.index}
          </div>
          {step.headersAdded && step.headersAdded.length > 0 && (
            <div className="text-[10px]">
              <span className="text-text-muted">Headers added: </span>
              {step.headersAdded.map((h) => (
                <Badge key={h} variant="violet">{h}</Badge>
              ))}
            </div>
          )}
          {step.isCacheHit && (
            <div className="text-[10px] text-emerald-400">Cache hit — fetch() was skipped</div>
          )}
          {step.hasError && (
            <div className="text-[10px] text-red-400">Error occurred in this middleware</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Aggregate Stats Panel ───────────────────────────────────────────────────

function AggregateStatsPanel({ stats }: { stats: MiddlewareStats[] }) {
  if (stats.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-[10px] text-text-muted">
        No middleware stats
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border-subtle text-left text-text-muted">
            <th className="px-3 py-1.5 font-medium">Middleware</th>
            <th className="px-2 py-1.5 font-medium text-right">Calls</th>
            <th className="px-2 py-1.5 font-medium text-right">Avg</th>
            <th className="px-2 py-1.5 font-medium text-right">Max</th>
            <th className="px-2 py-1.5 font-medium text-right">Errors</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.name} className="border-b border-border-subtle">
              <td className="px-3 py-1.5 font-mono text-text-secondary">{s.name}</td>
              <td className="px-2 py-1.5 text-right text-text-muted">{s.calls}</td>
              <td className="px-2 py-1.5 text-right text-text-muted">{formatDuration(s.avgDuration)}</td>
              <td className={`px-2 py-1.5 text-right ${s.maxDuration > 10 ? "text-amber-400" : "text-text-muted"}`}>
                {formatDuration(s.maxDuration)}
              </td>
              <td className={`px-2 py-1.5 text-right ${s.errors > 0 ? "text-red-400" : "text-text-muted"}`}>
                {s.errors}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
