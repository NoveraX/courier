"use client"

import { cn } from "@/site/cn"
import { useInView } from "@/site/landing/use-in-view"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { durationTone, METHOD_TEXT } from "./method-tone"
import { formatMs, trafficBars, trafficRows } from "./traffic"
import { WindowNav, WindowTitleBar } from "./window-chrome"
import { WindowDetail } from "./window-detail"

/**
 * Studio as it looks running: its views down the side, a live chart of
 * the calls, the timeline taking a new call every second and a half, and
 * one call's details. It streams only while on screen.
 *
 * @returns The window
 * @example
 * ```tsx
 * <StudioWindow />
 * ```
 */
export function StudioWindow() {
  const [ref, inView] = useInView<HTMLDivElement>()
  const still = useReducedMotion()
  const step = useTicker(inView && !still, 1400)
  const rows = trafficRows(step)
  const bars = trafficBars(step)
  const tallest = Math.max(1, ...bars.map((bar) => bar.ok + bar.failed))
  return (
    <div
      ref={ref}
      aria-label="Courier Studio's timeline, streaming calls"
      role="img"
      className="overflow-hidden rounded-[15px] bg-panel"
    >
      <WindowTitleBar />
      <div className="grid h-107.5 grid-cols-1 min-[760px]:grid-cols-[150px_minmax(0,1fr)_250px]">
        <WindowNav />
        <div className="flex min-w-0 flex-col">
          <div className="flex h-13 items-end gap-0.5 border-b border-line px-3.5 pt-2.5 pb-2">
            {bars.map((bar, at) => (
              <span key={bar.n} className="flex h-full flex-1 flex-col justify-end gap-px">
                <span
                  className="rounded-[1px] bg-err"
                  style={{ height: `${(bar.failed / tallest) * 100}%` }}
                />
                <span
                  className={cn(
                    "rounded-[1px] transition-[height] duration-400",
                    at === bars.length - 1 ? "bg-brand" : "bg-brand/55"
                  )}
                  style={{ height: `${(bar.ok / tallest) * 100}%` }}
                />
              </span>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-hidden font-mono text-[11.5px]">
            {rows.map((row, at) => (
              <div
                key={row.n}
                className={cn(
                  "relative grid h-8.25 grid-cols-[42px_minmax(0,1fr)_34px_58px] items-center gap-2.5 border-b border-line px-3.5",
                  at === 0 && "studio-row-in bg-brand/6",
                  at !== 0 && row.endpoint === "orders.create" && "bg-brand-dim"
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 w-0.5",
                    at === 0 ? "bg-brand" : "bg-transparent"
                  )}
                />
                <span className={cn("text-[10px] font-semibold", METHOD_TEXT[row.method])}>
                  {row.method}
                </span>
                <span className="truncate">
                  <span className="text-fg-subtle">{row.source}</span>
                  {row.endpoint}
                </span>
                <span className={row.status >= 400 ? "text-err" : "text-ok"}>{row.status}</span>
                <span className={cn("text-right", durationTone(row.ms))}>{formatMs(row.ms)}</span>
              </div>
            ))}
          </div>
        </div>
        <WindowDetail />
      </div>
    </div>
  )
}
