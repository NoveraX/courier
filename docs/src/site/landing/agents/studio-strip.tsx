import { Activity } from "lucide-react"

import { cn } from "@/site/cn"
import type { CallProgress, ScriptCall } from "./session-script"

const VERB_TONE = { GET: "text-verb-get", POST: "text-verb-post" } as const

/**
 * Studio's timeline under the session: each call the agent made, as a row
 * marked `agent`, once it has been answered.
 *
 * @param props - The calls, and how far each has gone
 * @returns The strip
 * @example
 * ```tsx
 * <StudioStrip calls={SESSION_CALLS} progress={["done", "unmade"]} />
 * ```
 */
export function StudioStrip({
  calls,
  progress,
}: {
  calls: readonly ScriptCall[]
  progress: readonly CallProgress[]
}) {
  return (
    <div className="border-t border-line bg-bg-subtle px-4 pt-2.5 pb-3">
      <p className="m-0 mb-1.5 flex items-center gap-1.75 font-mono text-[10px] tracking-[0.08em] text-fg-subtle">
        <Activity aria-hidden="true" className="size-3 text-brand" />
        STUDIO · TIMELINE
      </p>
      <div className="grid gap-1">
        {calls.map((call, at) => (
          <div
            key={call.tool}
            className={cn(
              "grid grid-cols-[42px_minmax(0,1fr)_auto_auto_auto] items-center gap-2.5 font-mono text-[11px] transition-all duration-500",
              progress[at] === "done" ? "opacity-100" : "translate-y-1 opacity-0"
            )}
          >
            <span className={VERB_TONE[call.verb]}>{call.verb}</span>
            <span className="truncate text-fg">{call.endpoint}</span>
            <span className="rounded-chip bg-tone-blue/12 px-1.5 py-px font-sans text-[10px] font-medium text-tone-blue">
              agent
            </span>
            <span className="text-ok tabular-nums">{call.status}</span>
            <span className="w-11 text-right text-fg-subtle tabular-nums">{call.ms} ms</span>
          </div>
        ))}
      </div>
    </div>
  )
}
