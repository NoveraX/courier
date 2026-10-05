"use client"

import { cn } from "@/site/cn"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { METHOD_TEXT } from "@/site/studio-landing/hero/method-tone"
import { useSeen } from "@/site/studio-landing/use-seen"
import { stagger } from "./stagger"
import { VizFrame } from "./viz-frame"
import type { PhaseTone } from "./waterfall-model"
import { WATERFALL_ROWS, WATERFALL_SPAN_MS } from "./waterfall-model"

const PHASE: Readonly<Record<PhaseTone, string>> = {
  proxy: "bg-tone-teal",
  middleware: "bg-tone-violet",
  fetch: "bg-tone-blue",
  validation: "bg-tone-amber",
  "middleware-out": "bg-[color-mix(in_srgb,var(--color-tone-violet)_55%,var(--color-bg))]",
  "proxy-out": "bg-[color-mix(in_srgb,var(--color-tone-teal)_55%,var(--color-bg))]",
}

/**
 * A page load in the Waterfall: each call's bar laid on the time axis in
 * its phases' colours, drawn in one after another, with a scan line
 * sweeping across and one row lit in turn.
 *
 * @returns The visual
 * @example
 * ```tsx
 * <WaterfallViz />
 * ```
 */
export function WaterfallViz() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  const still = useReducedMotion()
  const step = useTicker(seen && !still, 1600)
  return (
    <VizFrame name="inspect" frameRef={ref} seen={seen}>
      <div
        role="img"
        aria-label="A waterfall of seven calls, each split into its phases"
        className="relative flex flex-col gap-1 px-4 pt-4 pb-3 font-mono text-[11.5px]"
      >
        <div className="pointer-events-none absolute top-9.5 right-4 bottom-3 left-41.5">
          <span
            data-a="scan"
            className="absolute inset-y-0 w-px bg-[linear-gradient(180deg,transparent,var(--color-brand)_20%,var(--color-brand)_80%,transparent)] shadow-[0_0_12px_var(--color-brand)]"
          />
        </div>
        <div className="flex justify-between pb-2 pl-37.5 text-[10px] text-fg-subtle">
          {["+0ms", "+250ms", "+500ms", "+750ms"].map((mark) => (
            <span key={mark}>{mark}</span>
          ))}
        </div>
        {WATERFALL_ROWS.map((row, at) => (
          <div
            key={row.endpoint}
            style={stagger(at)}
            className={cn(
              "-mx-1.5 grid h-7 grid-cols-[140px_minmax(0,1fr)] items-center gap-2.5 rounded-chip px-1.5 transition-colors duration-450",
              at === step % WATERFALL_ROWS.length && "bg-brand/8"
            )}
          >
            <span className="flex gap-1.75 overflow-hidden whitespace-nowrap">
              <span className={cn("w-8.5 text-[10px] font-semibold", METHOD_TEXT[row.method])}>
                {row.method}
              </span>
              <span className="truncate">{row.endpoint}</span>
            </span>
            <span className="relative h-3 bg-[repeating-linear-gradient(90deg,var(--color-line)_0_1px,transparent_1px_25%)]">
              <span
                data-a="wf"
                className="absolute inset-y-0 flex gap-px overflow-hidden rounded-[3px]"
                style={{
                  ...stagger(at),
                  left: `${(row.startMs / WATERFALL_SPAN_MS) * 100}%`,
                  width: `${(row.durationMs / WATERFALL_SPAN_MS) * 100}%`,
                }}
              >
                {row.phases.map((phase) => (
                  <span
                    key={phase.tone}
                    className={PHASE[phase.tone]}
                    style={{ flex: `${phase.share} 1 0px` }}
                  />
                ))}
                <span
                  data-a="shine"
                  style={stagger(at)}
                  className="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.4),transparent)]"
                />
              </span>
            </span>
          </div>
        ))}
      </div>
    </VizFrame>
  )
}
