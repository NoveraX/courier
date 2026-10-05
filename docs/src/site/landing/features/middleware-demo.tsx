"use client"

import type { ReactNode } from "react"

import { cn } from "@/site/cn"
import { useFeatureTime } from "./feature-clock"
import { MIDDLEWARE_STEPS, middlewareFrame } from "./feature-frames"

const LAYERS = ["logMiddleware()", "retryMiddleware({ limit: 3 })", "authMiddleware({ getToken })"]
const RADIUS = ["rounded-[12px]", "rounded-[10px]", "rounded-control"]

function layerLook(layer: number, active: number): string {
  return layer === active
    ? "border-(--tone) bg-[rgb(var(--tone-rgb)/0.1)]"
    : "border-line-strong bg-transparent"
}

function Layer({ at, active, children }: { at: number; active: number; children: ReactNode }) {
  return (
    <div
      className={cn(
        "border px-2.75 pt-2.25 pb-2.75 transition-all duration-300",
        RADIUS[at],
        layerLook(at, active)
      )}
    >
      <div className="mb-1.75 font-mono text-micro text-fg-subtle">{LAYERS[at]}</div>
      {children}
    </div>
  )
}

/**
 * A call through three middleware: the layers nested as they wrap the
 * fetch, the one the call is in lit, and what each did on the way in and
 * on the way out.
 *
 * @returns The demo
 * @example
 * ```tsx
 * <MiddlewareDemo />
 * ```
 */
export function MiddlewareDemo() {
  const { tick, still } = useFeatureTime()
  const step = still ? MIDDLEWARE_STEPS.length - 1 : middlewareFrame(tick)
  const active = MIDDLEWARE_STEPS[step]?.layer ?? -1
  const shown = MIDDLEWARE_STEPS.slice(0, Math.min(step + 1, MIDDLEWARE_STEPS.length)).slice(-5)
  return (
    <div className="mx-auto grid max-w-[680px] grid-cols-1 items-center gap-4.5 min-[760px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Layer at={0} active={active}>
        <Layer at={1} active={active}>
          <Layer at={2} active={active}>
            <div
              className={cn(
                "flex h-8.5 items-center justify-center rounded-[7px] border font-mono text-[11.5px] text-fg transition-all duration-300",
                layerLook(3, active)
              )}
            >
              fetch
            </div>
          </Layer>
        </Layer>
      </Layer>
      <div className="flex min-h-37.5 flex-col justify-end gap-1.5">
        {shown.map((line, at) => (
          <div
            key={line.message}
            className={cn(
              "flex gap-2.5 font-mono text-[11.5px] transition-opacity duration-300",
              at === shown.length - 1 ? "opacity-100" : "opacity-55"
            )}
          >
            <span className={cn("min-w-3", line.inward ? "text-(--tone)" : "text-ok")}>
              {line.inward ? "→" : "←"}
            </span>
            <span className="text-fg-muted">{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
