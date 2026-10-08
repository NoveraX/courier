"use client"

import { ArrowRight } from "lucide-react"

import { cn } from "@/site/cn"
import { stagger } from "@/site/studio-landing/chapters/stagger"
import { VizFrame } from "@/site/studio-landing/chapters/viz-frame"
import { useSeen } from "@/site/studio-landing/use-seen"

const ENDPOINTS = [
  { endpoint: "orders.list", access: "read", tool: "orders_list" },
  { endpoint: "orders.get", access: "read", tool: "orders_get" },
  { endpoint: "orders.place", access: "write", tool: "orders_place" },
  { endpoint: "orders.cancel", access: "destructive", tool: "orders_cancel" },
  { endpoint: "payouts.export", access: undefined, tool: undefined },
  { endpoint: "admin.purge", access: undefined, tool: undefined },
] as const

const HINT = {
  read: "border-tone-teal/35 text-tone-teal",
  write: "border-tone-amber/40 text-tone-amber",
  destructive: "border-tone-red/40 text-tone-red",
} as const

/**
 * What becomes a tool: the API's endpoints on the left, the tools an agent
 * is offered on the right — the marked ones with their hint, the rest
 * offered to no one.
 *
 * @returns The visual
 * @example
 * ```tsx
 * <ScopeViz />
 * ```
 */
export function ScopeViz() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  return (
    <VizFrame name="scope" frameRef={ref} seen={seen}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] border-b border-line bg-bg-subtle px-4.5 py-2.5 font-mono text-[10px] tracking-[0.08em] text-fg-subtle">
        <span>api/shop.ts</span>
        <span />
        <span className="text-right">tools/list</span>
      </div>
      <div className="grid gap-1.5 p-4.5">
        {ENDPOINTS.map((row, at) => (
          <div
            key={row.endpoint}
            data-a="pop"
            style={stagger(at)}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 font-mono text-[11.5px]"
          >
            <span
              className={cn(
                "truncate rounded-[7px] border px-2.5 py-1.5",
                row.tool ? "border-line-strong text-fg" : "border-dashed border-line text-fg-subtle"
              )}
            >
              {row.endpoint}
            </span>
            <ArrowRight
              aria-hidden="true"
              className={cn("size-3.5", row.tool ? "text-(--tone)" : "text-line-strong")}
            />
            {row.tool && row.access ? (
              <span className="flex min-w-0 items-center justify-between gap-2 rounded-[7px] border border-[rgb(var(--tone-rgb)/0.35)] bg-[rgb(var(--tone-rgb)/0.08)] px-2.5 py-1.5">
                <span className="truncate text-fg">{row.tool}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-chip border px-1.5 text-[9.5px]",
                    HINT[row.access]
                  )}
                >
                  {row.access}
                </span>
              </span>
            ) : (
              <span className="px-2.5 text-[11px] text-fg-subtle italic">not offered</span>
            )}
          </div>
        ))}
      </div>
    </VizFrame>
  )
}
