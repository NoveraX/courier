"use client"

import { CircleCheck, CircleX, TriangleAlert } from "lucide-react"

import { cn } from "@/site/cn"
import { useReducedMotion } from "@/site/landing/use-reduced-motion"
import { useTicker } from "@/site/landing/use-ticker"
import { useCountUp } from "@/site/studio-landing/use-count-up"
import { useSeen } from "@/site/studio-landing/use-seen"
import type { Severity } from "./audit-model"
import { AUDIT_RULES, auditFrame, auditScore, scoreLook } from "./audit-model"
import { AuditRing } from "./audit-ring"
import { stagger } from "./stagger"
import { VizFrame } from "./viz-frame"

const LOOK: Readonly<Record<Severity, { icon: typeof CircleX; tile: string }>> = {
  error: { icon: CircleX, tile: "bg-err/12 text-err" },
  warning: { icon: TriangleAlert, tile: "bg-warn/12 text-warn" },
  pass: { icon: CircleCheck, tile: "bg-ok/12 text-ok" },
}

/**
 * The audit of a session: its score on a ring, what the score means, and
 * four rules re-checked one by one — each switching between failing and
 * fixed as the sessions change.
 *
 * @returns The visual
 * @example
 * ```tsx
 * <AuditViz />
 * ```
 */
export function AuditViz() {
  const [ref, seen] = useSeen<HTMLDivElement>(0.3)
  const still = useReducedMotion()
  const tick = useTicker(seen && !still, 533)
  const frame = auditFrame(still ? 0 : tick)
  const score = auditScore(frame.severities)
  const shown = useCountUp(score, frame.checking >= 0 ? 600 : 1500, seen, still)
  const look = scoreLook(score)
  const issues = frame.severities.filter((s) => s !== "pass").length
  return (
    <VizFrame name="audit" frameRef={ref} seen={seen}>
      <div className="flex flex-col gap-3 p-4.5">
        <div className="flex items-center gap-4.5 pb-1.5">
          <AuditRing value={shown} tone={look.tone} checking={frame.checking >= 0} />
          <div data-a="pop" style={stagger(2)} className="flex flex-col gap-1.25">
            <span className="text-[16px] font-semibold">{look.label}</span>
            <span className="text-small text-fg-muted">
              {issues
                ? `${issues} ${issues === 1 ? "issue" : "issues"} to fix before release`
                : "Ready to release"}
            </span>
          </div>
        </div>
        {AUDIT_RULES.map((rule, at) => {
          const severity = frame.severities[at] ?? "pass"
          const { title, detail } = severity === "pass" ? rule.passing : rule.failing
          const Icon = LOOK[severity].icon
          return (
            <div
              key={rule.failing.title}
              data-a="pop"
              style={stagger(at + 3)}
              className={cn(
                "flex items-center gap-2.75 rounded-[11px] border px-3 py-2.5 transition-[border-color,background-color,box-shadow] duration-350",
                frame.checking === at
                  ? "border-warn bg-[color-mix(in_srgb,var(--color-warn)_7%,var(--color-inset))] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-warn)_12%,transparent)]"
                  : "border-line bg-inset"
              )}
            >
              <span
                className={cn(
                  "grid size-6.5 shrink-0 place-items-center rounded-control",
                  LOOK[severity].tile
                )}
              >
                <Icon aria-hidden="true" className="size-3.25" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-small font-semibold">{title}</span>
                <span className="truncate text-[11.5px] text-fg-subtle">{detail}</span>
              </span>
            </div>
          )
        })}
      </div>
    </VizFrame>
  )
}
