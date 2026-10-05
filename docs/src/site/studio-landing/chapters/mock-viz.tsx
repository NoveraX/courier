"use client"

import type { LucideIcon } from "lucide-react"
import { CloudDrizzle, CloudLightning, CloudOff, ShieldCheck } from "lucide-react"

import { cn } from "@/site/cn"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { useCountUp } from "@/site/studio-landing/use-count-up"
import { useSeen } from "@/site/studio-landing/use-seen"
import type { CallOutcome } from "./mock-model"
import { CHAOS_PRESETS, callStrip, presetAt } from "./mock-model"
import { stagger } from "./stagger"
import { VizFrame } from "./viz-frame"

const ICONS: readonly LucideIcon[] = [ShieldCheck, CloudDrizzle, CloudLightning, CloudOff]
const TONE = { ok: "text-ok", warn: "text-warn", err: "text-err" } as const
const ON = {
  ok: "border-ok bg-[color-mix(in_srgb,var(--color-ok)_8%,var(--color-panel))]",
  warn: "border-warn bg-[color-mix(in_srgb,var(--color-warn)_8%,var(--color-panel))]",
  err: "border-err bg-[color-mix(in_srgb,var(--color-err)_8%,var(--color-panel))]",
} as const
const FILL = { ok: "bg-ok", warn: "bg-warn", err: "bg-err" } as const
const OUTCOME: Readonly<Record<CallOutcome, string>> = {
  ok: "bg-ok/70",
  slow: "bg-warn",
  failed: "bg-err",
}

/**
 * Chaos on a mock backend: the presets with the one in force lit, its
 * error rate on a slider, and the latest calls coming back — red as often
 * as the preset says. The presets step through on their own.
 *
 * @returns The visual
 * @example
 * ```tsx
 * <MockViz />
 * ```
 */
export function MockViz() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  const still = useReducedMotion()
  const step = useTicker(seen && !still, 1600)
  const calls = useTicker(seen && !still, 1400)
  const preset = still ? 2 : presetAt(step)
  const rate = CHAOS_PRESETS[preset]?.errorRate ?? 0
  const shown = useCountUp(rate, 1000, seen, still)
  const width = `${Math.max(2, rate)}%`
  return (
    <VizFrame name="mock" frameRef={ref} seen={seen}>
      <div
        role="img"
        aria-label={`Chaos preset ${CHAOS_PRESETS[preset]?.label}: ${rate}% of calls fail`}
        className="flex flex-col gap-3.5 p-4.5"
      >
        <div className="grid grid-cols-4 gap-2">
          {CHAOS_PRESETS.map((item, at) => {
            const Icon = ICONS[at] ?? ShieldCheck
            const on = at === preset
            return (
              <div
                key={item.label}
                data-a="pop"
                style={stagger(at)}
                className={cn(
                  "relative flex flex-col gap-2 rounded-[11px] border p-2.75 transition-[border-color,background-color] duration-500",
                  on ? ON[item.tone] : "border-line bg-inset"
                )}
              >
                <span
                  data-g={on ? "1" : undefined}
                  className="pointer-events-none absolute -inset-px rounded-[11px]"
                />
                <Icon aria-hidden="true" className={cn("size-3.5", TONE[item.tone])} />
                <span className="text-label font-semibold">{item.label}</span>
                <span className="h-0.75 overflow-hidden rounded-[2px] bg-raised">
                  <span
                    data-a="grow"
                    style={{ ...stagger(at), width: `${item.errorRate}%` }}
                    className={cn("block h-full", FILL[item.tone])}
                  />
                </span>
              </div>
            )
          })}
        </div>
        <div className="flex flex-col gap-2 rounded-[11px] border border-line bg-inset px-3.5 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-label text-fg-muted">Error rate</span>
            <span className="font-mono text-[20px] text-err tabular-nums">
              {shown}
              <span className="text-label text-fg-subtle">%</span>
            </span>
          </div>
          <div className="relative h-1.5 rounded-[3px] bg-raised">
            <span
              data-a="grow"
              style={{ ...stagger(3), width }}
              className="absolute inset-y-0 left-0 rounded-[3px] bg-[linear-gradient(90deg,var(--color-warn),var(--color-err))] transition-[width] duration-1000 ease-[cubic-bezier(.65,0,.35,1)]"
            />
            <span
              data-a="thumb"
              style={{ left: `calc(${width} - 9px)` }}
              className="absolute -top-1.5 size-4.5 rounded-full bg-fg transition-[left] duration-1000 ease-[cubic-bezier(.65,0,.35,1)]"
            />
          </div>
        </div>
        <div className="flex h-6.5 gap-0.5">
          {callStrip(calls, preset).map(({ n, outcome }, at) => (
            <span
              key={n}
              data-a="bar"
              style={stagger(at)}
              className={cn(
                "flex-1 rounded-[2px] transition-colors duration-500",
                OUTCOME[outcome]
              )}
            />
          ))}
        </div>
      </div>
    </VizFrame>
  )
}
