"use client"

import { cn } from "@/site/cn"
import { useFeatureTime } from "./feature-clock"
import { errorsFrame } from "./feature-frames"

const ROWS = [
  { expr: "catch (error)", type: "unknown", tone: "text-fg-muted" },
  { expr: "isHTTPError<ApiError>(error)", type: "true", tone: "text-ok" },
  { expr: "error.status", type: "404", tone: "text-tone-amber" },
  { expr: "error.data.message", type: '"User not found"', tone: "text-tone-green" },
]

/**
 * A caught error narrowed step by step: unknown, then an HTTP error, then
 * its status and its typed body — each step lit in turn.
 *
 * @returns The demo
 * @example
 * ```tsx
 * <ErrorsDemo />
 * ```
 */
export function ErrorsDemo() {
  const { tick, still } = useFeatureTime()
  const lit = still ? ROWS.length - 1 : errorsFrame(tick)
  return (
    <div className="mx-auto flex max-w-[560px] flex-col gap-2">
      {ROWS.map((row, at) => (
        <div
          key={row.expr}
          className={cn(
            "flex min-w-0 items-center gap-3 rounded-[10px] border px-3.25 py-2.5 transition-all duration-350",
            at === lit
              ? "border-[rgb(var(--tone-rgb)/0.5)] bg-[rgb(var(--tone-rgb)/0.07)]"
              : "border-line bg-panel",
            /* The steps not reached yet are dimmed as the motion goes, and shown whole to a
               reader who asks for more contrast. */
            at <= lit ? "opacity-100" : "opacity-35 contrast-more:opacity-100"
          )}
        >
          <code className="min-w-0 flex-1 truncate text-label text-fg">{row.expr}</code>
          <span
            className={cn(
              "shrink-0 rounded-chip bg-raised px-2 py-0.75 font-mono text-[11px]",
              at <= lit ? row.tone : "text-fg-subtle"
            )}
          >
            {row.type}
          </span>
        </div>
      ))}
    </div>
  )
}
