interface ProgressBarsProps {
  /** The upload's progress as the browser last reported it, 0 to 100. */
  reported: number
  /** The same progress through smoothProgress, 0 to 100. */
  smoothed: number
}

/** One upload's progress twice: as the browser reports it, and as smoothProgress moves the bar. */
export function ProgressBars({ reported, smoothed }: ProgressBarsProps) {
  return (
    <div className="grid gap-2.5">
      <ProgressRow label="as the browser reports it" percent={reported} tone="bg-tone-amber" />
      <ProgressRow label="through smoothProgress" percent={smoothed} tone="bg-brand" />
    </div>
  )
}

function ProgressRow({ label, percent, tone }: { label: string; percent: number; tone: string }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between font-mono text-[11px] text-fg-subtle">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(percent)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
