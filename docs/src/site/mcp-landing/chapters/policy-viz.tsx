"use client"

import { cn } from "@/site/cn"
import { stagger } from "@/site/studio-landing/chapters/stagger"
import { VizFrame } from "@/site/studio-landing/chapters/viz-frame"
import { useSeen } from "@/site/studio-landing/use-seen"

const RULE = [
  'if (ctx.agent?.access !== "read"',
  "    && !canWrite(ctx.agent.principal))",
  '  return { status: 403, data: { message: "Reads only" } }',
]

const CALLERS = [
  { principal: "support-bot", role: "reads", status: 403, result: "Reads only", ok: false },
  { principal: "ops-agent", role: "writes", status: 200, result: "o_7f2a · refunded", ok: true },
] as const

const STAGES = ["ctx.agent", "agents policy", "auth", "api"]

/**
 * One tool, two principals: the same call to refund an order through the
 * same middleware, refused for an agent that may only read and carried out
 * for one that may write.
 *
 * @returns The visual
 * @example
 * ```tsx
 * <PolicyViz />
 * ```
 */
export function PolicyViz() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  return (
    <VizFrame name="policy" frameRef={ref} seen={seen}>
      <pre className="m-0 overflow-x-auto border-b border-line bg-bg-subtle px-4.5 py-3 font-mono text-[11px] leading-[1.7] text-code-plain">
        {RULE.join("\n")}
      </pre>
      <div className="grid gap-4 p-4.5">
        {CALLERS.map((caller, row) => (
          <div key={caller.principal} className="grid gap-2">
            <div
              data-a="pop"
              style={stagger(row * 5)}
              className="flex items-center gap-2 font-mono text-[11.5px]"
            >
              <span className="text-fg">{caller.principal}</span>
              <span className="text-fg-subtle">· {caller.role}</span>
              <span className="ml-auto text-fg-muted">shop_orders_refund</span>
            </div>
            <div className="flex flex-wrap items-center gap-1 font-mono text-[10.5px]">
              {STAGES.map((stage, at) => {
                const stopped = !caller.ok && at > 1
                return (
                  <span
                    key={stage}
                    data-a="pop"
                    style={stagger(row * 5 + at + 1)}
                    className="flex items-center gap-1"
                  >
                    {at > 0 && (
                      <span className={cn(stopped ? "text-line-strong" : "text-(--tone)")}>→</span>
                    )}
                    <span
                      className={cn(
                        "rounded-[5px] border px-1.5 py-0.5",
                        stopped
                          ? "border-dashed border-line text-fg-subtle"
                          : at === 1 && !caller.ok
                            ? "border-err/50 bg-err/10 text-err"
                            : "border-[rgb(var(--tone-rgb)/0.4)] bg-[rgb(var(--tone-rgb)/0.1)] text-fg"
                      )}
                    >
                      {stage}
                    </span>
                  </span>
                )
              })}
              <span
                data-a="pop"
                style={stagger(row * 5 + 5)}
                className={cn(
                  "ml-auto rounded-chip px-1.75 py-0.5",
                  caller.ok ? "bg-ok/12 text-ok" : "bg-err/12 text-err"
                )}
              >
                {caller.status} · {caller.result}
              </span>
            </div>
          </div>
        ))}
      </div>
    </VizFrame>
  )
}
