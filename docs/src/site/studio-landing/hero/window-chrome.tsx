import type { LucideIcon } from "lucide-react"
import {
  Activity,
  ChartColumn,
  GitCompare,
  Lock,
  Network,
  Play,
  Server,
  Shield,
  Timer,
} from "lucide-react"

import { cn } from "@/site/cn"

const NAV: readonly { label: string; icon: LucideIcon }[] = [
  { label: "Timeline", icon: Activity },
  { label: "Waterfall", icon: Timer },
  { label: "Analytics", icon: ChartColumn },
  { label: "Explorer", icon: Network },
  { label: "Playground", icon: Play },
  { label: "Mocks", icon: Server },
  { label: "Audit", icon: Shield },
  { label: "Compare", icon: GitCompare },
]

/**
 * The Studio window's title bar: its address and the recording mark.
 *
 * @returns The bar
 * @example
 * ```tsx
 * <WindowTitleBar />
 * ```
 */
export function WindowTitleBar() {
  return (
    <div className="flex h-10 items-center gap-3 border-b border-line bg-bg-subtle px-3.5">
      <span aria-hidden="true" className="flex gap-1.5">
        {["a", "b", "c"].map((dot) => (
          <span key={dot} className="size-2.5 rounded-full bg-raised" />
        ))}
      </span>
      <span className="flex flex-1 justify-center">
        <span className="flex h-6 items-center gap-1.75 rounded-chip bg-inset px-3 font-mono text-[11px] text-fg-subtle">
          <Lock aria-hidden="true" className="size-2.5" />
          localhost:6280/timeline
        </span>
      </span>
      <span className="flex items-center gap-1.5 font-mono text-micro tracking-[0.06em] text-err">
        <span className="size-1.5 rounded-full bg-current" />
        REC
      </span>
    </div>
  )
}

/**
 * The Studio window's views down its side, the Timeline open.
 *
 * @returns The navigation
 * @example
 * ```tsx
 * <WindowNav />
 * ```
 */
export function WindowNav() {
  return (
    <div className="hidden flex-col gap-0.5 border-r border-line bg-bg-subtle px-2 py-3 min-[760px]:flex">
      {NAV.map(({ label, icon: Icon }, at) => (
        <span
          key={label}
          className={cn(
            "flex h-7.5 items-center gap-2.25 rounded-[7px] px-2.5 text-label",
            at === 0 ? "bg-raised text-fg" : "text-fg-muted"
          )}
        >
          <Icon aria-hidden="true" className={cn("size-3.25", at === 0 && "text-brand")} />
          {label}
        </span>
      ))}
    </div>
  )
}
