import type { RequestEntry, RequestTiming } from "../../../store"

import { Section, Row, formatDuration } from "../../../components/ui"

// ── Timing Tab ───────────────────────────────────────────────────────────────

export function TimingTab({ request }: { request: RequestEntry }) {
  if (!request.timing) {
    return <p className="text-[11px] italic text-text-muted">No timing data</p>
  }

  return (
    <>
      <TimingBar timing={request.timing} />

      <Section title="Breakdown">
        <Row label="Total" value={formatDuration(request.timing.total)} />
        {request.timing.middleware > 0 && (
          <Row label="Middleware" value={formatDuration(request.timing.middleware)} />
        )}
        {request.timing.fetch > 0 && (
          <Row label="Fetch" value={formatDuration(request.timing.fetch)} />
        )}
        {request.timing.validation > 0 && (
          <Row label="Validation" value={formatDuration(request.timing.validation)} />
        )}
      </Section>
    </>
  )
}

// ── Timing Bar ───────────────────────────────────────────────────────────────

export function TimingBar({ timing }: { timing: RequestTiming }) {
  if (timing.total === 0) return null

  const segments = [
    { label: "Middleware", value: timing.middleware, color: "bg-violet-500" },
    { label: "Fetch", value: timing.fetch, color: "bg-sky-500" },
    { label: "Validation", value: timing.validation, color: "bg-amber-500" },
  ].filter((s) => s.value > 0)

  return (
    <div className="mb-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={`${seg.color} opacity-80 transition-all duration-300`}
            style={{ width: `${(seg.value / timing.total) * 100}%` }}
            title={`${seg.label}: ${formatDuration(seg.value)}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex gap-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1">
            <div className={`h-1.5 w-1.5 rounded-full ${seg.color}`} />
            <span className="text-[10px] text-text-muted">{seg.label}</span>
            <span className="text-[10px] tabular-nums text-text-secondary">
              {formatDuration(seg.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
