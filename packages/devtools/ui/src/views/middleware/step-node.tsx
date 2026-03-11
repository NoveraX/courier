import { useState } from "react"
import { ChevronDown, ChevronRight, AlertTriangle, RotateCcw, Database } from "lucide-react"

import { Badge, formatDuration } from "../../components/ui"

import type { MiddlewareStep } from "./helpers"
import { SLOW_STEP_MS } from "./helpers"

export function MiddlewareStepNode({ step, direction }: { step: MiddlewareStep; direction: "down" | "up" }) {
  const [expanded, setExpanded] = useState(false)
  const arrow = direction === "down" ? "\u2192" : "\u2190"
  const isSlow = step.duration > SLOW_STEP_MS

  return (
    <div className="ml-2">
      <div className="ml-2 h-2 w-px bg-violet-500/30" />
      <button type="button" onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-surface-1">
        {expanded ? <ChevronDown size={12} className="shrink-0 text-text-muted" /> : <ChevronRight size={12} className="shrink-0 text-text-muted" />}
        <span className="text-[11px] text-violet-400">{arrow}</span>
        <span className="text-[11px] font-medium text-text-secondary">{step.name}</span>
        <span className={`text-[10px] ${isSlow ? "text-amber-400" : "text-text-muted"}`}>{formatDuration(step.duration)}</span>
        {step.isCacheHit && <Database size={10} className="text-emerald-400" />}
        {step.isRetry && <RotateCcw size={10} className="text-amber-400" />}
        {step.hasError && <AlertTriangle size={10} className="text-red-400" />}
        {step.duration === 0 && <span className="text-[9px] text-text-muted">(passthrough)</span>}
      </button>

      {expanded && (
        <div className="ml-8 space-y-1 py-1">
          <div className="text-[10px] text-text-muted">Phase: {step.phase} | Index: {step.index}</div>
          {step.headersAdded && step.headersAdded.length > 0 && (
            <div className="text-[10px]">
              <span className="text-text-muted">Headers added: </span>
              {step.headersAdded.map((h) => <Badge key={h} variant="violet">{h}</Badge>)}
            </div>
          )}
          {step.isCacheHit && <div className="text-[10px] text-emerald-400">Cache hit — fetch() was skipped</div>}
          {step.hasError && <div className="text-[10px] text-red-400">Error occurred in this middleware</div>}
        </div>
      )}
    </div>
  )
}
