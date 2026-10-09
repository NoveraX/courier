import { Activity } from "lucide-react"

import { cn } from "@/site/cn"
import { MiddlewareTrail } from "./session-parts"
import type { CallProgress, ScriptCall } from "./session-script"

const VERB_TONE = { GET: "text-verb-get", POST: "text-verb-post" } as const

/**
 * Studio beside the agent's terminal: each call the agent made, as Studio's
 * Timeline records it — marked `agent` — with the middleware it runs
 * through lit as the call reaches each, and its status once answered.
 *
 * @param props - The calls, and how far each has gone
 * @returns The panel
 * @example
 * ```tsx
 * <StudioCalls calls={SESSION_CALLS} progress={["done", 2]} />
 * ```
 */
export function StudioCalls({
  calls,
  progress,
}: {
  calls: readonly ScriptCall[]
  progress: readonly CallProgress[]
}) {
  return (
    <div className="rounded-[12px] border border-line bg-panel px-4 pt-3 pb-3.5">
      <p className="m-0 mb-2 flex items-center gap-1.75 font-mono text-[10px] tracking-[0.08em] text-fg-subtle">
        <Activity aria-hidden="true" className="size-3 text-brand" />
        STUDIO · TIMELINE
      </p>
      <div className="grid gap-2.5">
        {calls.map((call, at) => {
          const state = progress[at] ?? "unmade"
          const answered = state === "done"
          return (
            <div
              key={call.tool}
              className={cn(
                "grid gap-1.5 transition-all duration-500",
                state === "unmade" || state === "waiting"
                  ? "translate-y-1 opacity-0"
                  : "opacity-100"
              )}
            >
              <div className="grid grid-cols-[42px_minmax(0,1fr)_auto_auto_auto] items-center gap-2.5 font-mono text-[11px]">
                <span className={VERB_TONE[call.verb]}>{call.verb}</span>
                <span className="truncate text-fg">{call.endpoint}</span>
                <span className="rounded-chip bg-tone-blue/12 px-1.5 py-px font-sans text-[10px] font-medium text-tone-blue">
                  agent
                </span>
                <span className={cn("tabular-nums", answered ? "text-ok" : "text-fg-subtle")}>
                  {answered ? call.status : "running"}
                </span>
                <span className="w-11 text-right text-fg-subtle tabular-nums">
                  {answered ? `${call.ms} ms` : ""}
                </span>
              </div>
              <MiddlewareTrail progress={state} className="pl-13" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
