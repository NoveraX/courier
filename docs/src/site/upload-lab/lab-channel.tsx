import type { ReactNode } from "react"

import type { LabStats } from "./lab-stats"

interface LabChannelProps {
  tone: "amber" | "blue"
  /** The callback the bar is drawn from, as code. */
  name: ReactNode
  caption: string
  /** Where the bar is, 0 to 1. */
  share: number
  stats: LabStats
  /** What a move of this bar is called: a report, or a move. */
  moves: string
}

/**
 * One bar of the lab: the callback it is drawn from, its share as a large
 * figure, the bar itself — no transition, so it moves exactly when told —
 * and how often it moved, its biggest jump and its longest wait.
 *
 * @param props - The bar's colour, name, share and numbers
 * @returns The readout
 * @example
 * ```tsx
 * <LabChannel tone="amber" name="onUploadProgress" caption="as the browser reports it" share={0.4} stats={stats} moves="reports" />
 * ```
 */
export function LabChannel({ tone, name, caption, share, stats, moves }: LabChannelProps) {
  const [whole, tenth] = (share * 100).toFixed(1).split(".")
  return (
    <div data-tone={tone} className="flex flex-col rounded-panel border border-line bg-bg/40 p-4.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 font-mono text-small text-fg">{name}</p>
          <p className="m-0 mt-1.25 text-label text-fg-subtle">{caption}</p>
        </div>
        <p className="m-0 font-mono text-[34px] leading-none font-medium tracking-[-0.04em] text-fg tabular-nums">
          {whole}
          <span className="text-fg-subtle">.{tenth}%</span>
        </p>
      </div>
      {/* At the bottom, so two bars side by side line up whatever their captions wrap to. */}
      <div className="mt-auto pt-4.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-(--tone) shadow-[0_0_16px_rgb(var(--tone-rgb)/0.6)]"
            style={{ width: `${share * 100}%` }}
          />
        </div>
        <dl className="m-0 mt-4 grid grid-cols-3 gap-3 font-mono">
          <Figure label={moves} value={String(stats.count)} />
          <Figure label="biggest jump" value={`${Math.round(stats.step * 100)}%`} />
          <Figure label="longest wait" value={`${Math.round(stats.wait)} ms`} />
        </dl>
      </div>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-micro tracking-[0.04em] text-fg-subtle">{label}</dt>
      <dd className="m-0 mt-1 text-[14px] text-fg tabular-nums">{value}</dd>
    </div>
  )
}
