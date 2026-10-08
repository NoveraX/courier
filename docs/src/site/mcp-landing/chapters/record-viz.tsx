"use client"

import { Filter } from "lucide-react"

import { cn } from "@/site/cn"
import { stagger } from "@/site/studio-landing/chapters/stagger"
import { VizFrame } from "@/site/studio-landing/chapters/viz-frame"
import { useSeen } from "@/site/studio-landing/use-seen"

type Mode = "agent" | "proxy" | "direct"

const ROWS: readonly {
  id: string
  verb: "GET" | "POST"
  endpoint: string
  mode: Mode
  status: string
  tone: string
  ms: string
}[] = [
  {
    id: "r1",
    verb: "GET",
    endpoint: "shop.products.search",
    mode: "proxy",
    status: "200",
    tone: "text-ok",
    ms: "84 ms",
  },
  {
    id: "r2",
    verb: "GET",
    endpoint: "shop.orders.list",
    mode: "agent",
    status: "200",
    tone: "text-ok",
    ms: "38 ms",
  },
  {
    id: "r3",
    verb: "POST",
    endpoint: "shop.orders.cancel",
    mode: "agent",
    status: "declined",
    tone: "text-fg-subtle",
    ms: "—",
  },
  {
    id: "r4",
    verb: "POST",
    endpoint: "shop.cart.add",
    mode: "direct",
    status: "201",
    tone: "text-ok",
    ms: "52 ms",
  },
  {
    id: "r5",
    verb: "POST",
    endpoint: "shop.orders.refund",
    mode: "agent",
    status: "403",
    tone: "text-err",
    ms: "4 ms",
  },
  {
    id: "r6",
    verb: "POST",
    endpoint: "shop.orders.cancel",
    mode: "agent",
    status: "200",
    tone: "text-ok",
    ms: "64 ms",
  },
]

const MODE_LOOK: Readonly<Record<Mode, string>> = {
  agent: "bg-tone-blue/12 text-tone-blue",
  proxy: "bg-tone-teal/12 text-tone-teal",
  direct: "bg-raised text-fg-subtle",
}

const VERB_LOOK = { GET: "text-verb-get", POST: "text-verb-post" } as const

/**
 * Studio's timeline with agents at work: their calls marked `agent` beside
 * the app's own, a declined confirmation and a policy's 403 among them.
 *
 * @returns The visual
 * @example
 * ```tsx
 * <RecordViz />
 * ```
 */
export function RecordViz() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  return (
    <VizFrame name="record" frameRef={ref} seen={seen}>
      <div className="flex items-center gap-2 border-b border-line bg-bg-subtle px-4.5 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.08em] text-fg-subtle">TIMELINE</span>
        <span className="ml-auto flex items-center gap-1.5 rounded-chip border border-[rgb(var(--tone-rgb)/0.4)] bg-[rgb(var(--tone-rgb)/0.1)] px-2 py-0.5 text-[11px] text-fg">
          <Filter aria-hidden="true" className="size-3 text-(--tone)" />
          Mode: Agent
        </span>
      </div>
      <div className="grid p-2">
        {ROWS.map((row, at) => (
          <div key={row.id} data-a="pop" style={stagger(at)}>
            {/* Dimmed inside the part that animates in, whose entrance ends fully opaque. */}
            <div
              className={cn(
                "grid grid-cols-[42px_minmax(0,1fr)_auto_64px_48px] items-center gap-3 rounded-[7px] px-2.5 py-1.75 font-mono text-[11.5px]",
                row.mode !== "agent" && "opacity-40"
              )}
            >
              <span className={VERB_LOOK[row.verb]}>{row.verb}</span>
              <span className="truncate text-fg">{row.endpoint}</span>
              <span
                className={cn(
                  "rounded-chip px-1.5 py-px font-sans text-[10px] font-medium",
                  MODE_LOOK[row.mode]
                )}
              >
                {row.mode}
              </span>
              <span className={cn("text-right", row.tone)}>{row.status}</span>
              <span className="text-right text-fg-subtle tabular-nums">{row.ms}</span>
            </div>
          </div>
        ))}
      </div>
    </VizFrame>
  )
}
