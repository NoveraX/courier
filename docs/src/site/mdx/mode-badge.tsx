import { cn } from "@/site/cn"

type Mode = "direct" | "proxy" | "both"

const LOOK: Readonly<Record<Mode, { label: string; dot: string }>> = {
  proxy: { label: "proxy mode", dot: "bg-brand" },
  direct: { label: "direct mode", dot: "bg-ok" },
  both: { label: "both modes", dot: "bg-fg-subtle" },
}

/**
 * Which way of calling the API a section or page is about — through the
 * proxy, directly, or either.
 *
 * @param props - The mode
 * @returns The chip
 * @example
 * ```tsx
 * <ModeBadge mode="proxy" />
 * ```
 */
export function ModeBadge({ mode, className }: { mode: Mode; className?: string }) {
  const { label, dot } = LOOK[mode]
  return (
    <span
      data-badge=""
      className={cn(
        "inline-flex h-5.5 items-center gap-1.5 rounded-chip border border-line bg-panel px-2 align-middle font-mono text-[11px] font-normal tracking-normal text-fg-muted",
        className
      )}
    >
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </span>
  )
}
