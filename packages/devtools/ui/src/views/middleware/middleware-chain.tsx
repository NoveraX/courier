import { useMemo } from "react"

import type { RequestEntry } from "../../store"
import { Badge, formatDuration } from "../../components/ui"

import { estimateMiddlewareSteps, getOverheadPercent, OVERHEAD_WARN_PERCENT } from "./helpers"
import { MiddlewareStepNode } from "./step-node"

export function MiddlewareChain({ request }: { request: RequestEntry }) {
  const steps = useMemo(() => estimateMiddlewareSteps(request), [request])
  const label = [request.source, request.group, request.method].filter(Boolean).join(".")
  const overhead = getOverheadPercent(request)
  const requestPhase = steps.filter((s) => s.phase === "request")
  const responsePhase = steps.filter((s) => s.phase === "response")

  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-text-primary">{label}</span>
          <Badge variant={request.status === "success" ? "emerald" : "red"}>{request.status}</Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-text-muted">
          <span>Total: {formatDuration(request.timing?.total ?? 0)}</span>
          <span>Middleware: {formatDuration(request.timing?.middleware ?? 0)}</span>
          <span className={overhead > OVERHEAD_WARN_PERCENT ? "text-amber-400" : ""}>Overhead: {overhead.toFixed(1)}%</span>
        </div>
      </div>

      <div className="mb-4 h-px bg-border-default" />

      <div className="space-y-0">
        {requestPhase.map((step) => <MiddlewareStepNode key={`req-${step.index}`} step={step} direction="down" />)}
      </div>

      <div className="my-1 ml-4 flex items-center gap-2"><div className="h-4 w-px bg-sky-500/50" /></div>
      <div className="ml-2 flex items-center gap-2 rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2">
        <div className="h-2 w-2 rounded-full bg-sky-500" />
        <span className="text-[11px] font-medium text-sky-400">fetch()</span>
        <span className="text-[10px] text-text-muted">{formatDuration(request.timing?.fetch ?? 0)}</span>
        {request.timing?.fetch === 0 && <Badge variant="emerald">cache hit</Badge>}
      </div>
      <div className="my-1 ml-4 flex items-center gap-2"><div className="h-4 w-px bg-sky-500/50" /></div>

      <div className="space-y-0">
        {responsePhase.map((step) => <MiddlewareStepNode key={`res-${step.index}`} step={step} direction="up" />)}
      </div>

      <div className="mt-4 h-px bg-border-default" />
      <div className="mt-2 text-[11px] text-text-muted">
        Total middleware overhead: {formatDuration(request.timing?.middleware ?? 0)} ({overhead.toFixed(1)}% of total)
      </div>
    </div>
  )
}
