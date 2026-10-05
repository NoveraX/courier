import { Check, Minus, X } from "lucide-react"

import { cn } from "@/site/cn"
import type { Coverage } from "./compare-data"

const LOOK = {
  yes: { icon: Check, badge: "bg-ok/14 text-ok", label: "built in", legend: "built in" },
  part: {
    icon: Minus,
    badge: "bg-warn/14 text-warn",
    label: "partial or manual",
    legend: "partial / manual",
  },
  no: { icon: X, badge: "bg-raised text-fg-subtle", label: "missing", legend: "missing" },
} as const

/**
 * How well a tool covers a need, as a small tinted mark: a check, a dash
 * or a cross.
 *
 * @param props - The coverage, and its size
 * @returns The mark, named for screen readers
 * @example
 * ```tsx
 * <CoverageBadge coverage="part" />
 * ```
 */
export function CoverageBadge({
  coverage,
  size = "cell",
}: {
  coverage: Coverage
  size?: "cell" | "legend"
}) {
  const { icon: Icon, badge, label } = LOOK[coverage]
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center rounded-[5px]",
        badge,
        size === "cell" ? "size-4.5" : "size-4"
      )}
    >
      <Icon aria-hidden="true" className="size-2.75" strokeWidth={2.4} />
    </span>
  )
}

/**
 * What the coverage marks mean.
 *
 * @returns The legend
 * @example
 * ```tsx
 * <CoverageLegend />
 * ```
 */
export function CoverageLegend() {
  return (
    <div aria-hidden="true" className="flex flex-wrap gap-4 font-mono text-[11px] text-fg-subtle">
      {(["yes", "part", "no"] as const).map((coverage) => (
        <span key={coverage} className="flex items-center gap-1.75">
          <CoverageBadge coverage={coverage} size="legend" />
          {LOOK[coverage].legend}
        </span>
      ))}
    </div>
  )
}
