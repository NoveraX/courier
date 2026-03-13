import { ArrowRight } from "lucide-react"

import type { RequestEntry } from "../../../store"

import { Section, Row, formatDuration } from "../../../components/ui"

// ── Proxy Tab ────────────────────────────────────────────────────────────────
// Flow visualization: Client → Proxy → Backend with per-hop timing

export function ProxyTab({ request }: { request: RequestEntry }) {
  const pt = request.proxyTiming

  return (
    <>
      {/* Flow diagram */}
      <Section title="Proxy Flow">
        <div className="space-y-3">
          {/* Node row */}
          <div className="flex items-center gap-2">
            <FlowNode label="C" title="Client" color="sky" />
            <FlowArrow duration={pt?.clientToProxy} />
            <FlowNode label="P" title="Proxy" color="violet" />
            <FlowArrow duration={pt?.proxyToBackend} />
            <FlowNode label="B" title="Backend" color="emerald" />
          </div>

          {/* Labels */}
          <div className="flex justify-between px-1 text-[10px] text-muted-foreground">
            <span>Client</span>
            <span>Proxy Server</span>
            <span>Backend</span>
          </div>

          {/* Return path */}
          {pt && (
            <div className="flex items-center gap-2">
              <FlowNode label="C" title="Client" color="sky" />
              <FlowArrow duration={pt.proxyToClient} reverse />
              <FlowNode label="P" title="Proxy" color="violet" />
              <FlowArrow duration={pt.backendToProxy} reverse />
              <FlowNode label="B" title="Backend" color="emerald" />
            </div>
          )}
        </div>
      </Section>

      {/* Per-hop timing breakdown */}
      {pt && (
        <Section title="Hop Timing">
          <Row label="Client → Proxy" value={formatDuration(pt.clientToProxy)} />
          <Row label="Proxy → Backend" value={formatDuration(pt.proxyToBackend)} />
          <Row label="Backend → Proxy" value={formatDuration(pt.backendToProxy)} />
          <Row label="Proxy → Client" value={formatDuration(pt.proxyToClient)} />
          <div className="mt-1 border-t border-border pt-1">
            <Row
              label="Total round-trip"
              value={formatDuration(
                pt.clientToProxy + pt.proxyToBackend + pt.backendToProxy + pt.proxyToClient,
              )}
            />
          </div>
        </Section>
      )}

      {/* Request info */}
      {request.url && (
        <Section title="Details">
          <Row label="Backend URL" value={request.url} mono />
          {request.httpMethod && <Row label="Method" value={request.httpMethod} />}
        </Section>
      )}

      {!pt && (
        <div className="rounded border border-border bg-muted px-2 py-1.5 text-[10px] text-muted-foreground">
          Per-hop timing not available — enable proxy instrumentation for detailed breakdown
        </div>
      )}
    </>
  )
}

// ── Flow Components ──────────────────────────────────────────────────────────

function FlowNode({
  label,
  title,
  color,
}: {
  label: string
  title: string
  color: "sky" | "violet" | "emerald"
}) {
  const colors: Record<string, string> = {
    sky: "bg-sky-500/15 text-sky-400",
    violet: "bg-violet-500/15 text-violet-400",
    emerald: "bg-emerald-500/15 text-emerald-400",
  }

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${colors[color]}`}
      title={title}
    >
      {label}
    </div>
  )
}

function FlowArrow({
  duration,
  reverse,
}: {
  duration?: number
  reverse?: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <div
        className={`flex w-full items-center gap-0.5 ${reverse ? "flex-row-reverse" : ""}`}
      >
        <div className="h-px flex-1 border-b border-dashed border-border" />
        <ArrowRight
          size={10}
          className={`shrink-0 text-muted-foreground ${reverse ? "rotate-180" : ""}`}
        />
      </div>
      {duration !== undefined && (
        <span className="text-[9px] tabular-nums text-muted-foreground">
          {formatDuration(duration)}
        </span>
      )}
    </div>
  )
}
