import type { LucideIcon } from "lucide-react"
import { Info, Lightbulb, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/site/cn"

type CalloutVariant = "info" | "tip" | "warning"

const LOOK: Readonly<Record<CalloutVariant, { icon: LucideIcon; tone: string }>> = {
  info: { icon: Info, tone: "text-brand" },
  tip: { icon: Lightbulb, tone: "text-ok" },
  warning: { icon: TriangleAlert, tone: "text-warn" },
}

interface CalloutProps {
  variant?: CalloutVariant | undefined
  title?: string | undefined
  children?: ReactNode
}

/**
 * A note set apart from the page's text — information, a tip or a warning —
 * tinted in its tone, with its title above what it says.
 *
 * @param props - The kind of note, its title and its text
 * @returns The note
 * @example
 * ```tsx
 * <Callout variant="warning" title="No magic default">…</Callout>
 * ```
 */
export function Callout({ variant = "info", title, children }: CalloutProps) {
  const { icon: Icon, tone } = LOOK[variant]
  return (
    <div
      role="note"
      className={cn(
        "my-5 flex gap-3 rounded-panel border border-current/26 bg-current/7 px-4 py-3.5",
        tone
      )}
    >
      <span className="flex size-5.5 shrink-0 items-center justify-center rounded-chip bg-current/16">
        <Icon aria-hidden="true" className="size-3.25" />
      </span>
      <div className="min-w-0 flex-1 text-callout text-fg-muted [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&>p]:my-2 [&>p]:text-callout [&>ul]:my-2">
        {title && <p className="m-0 mb-1 font-semibold text-fg">{title}</p>}
        {children}
      </div>
    </div>
  )
}
