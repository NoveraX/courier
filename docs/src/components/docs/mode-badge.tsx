import { cn } from "@/lib/utils"

type Mode = "direct" | "proxy" | "both"

interface ModeBadgeProps {
  mode: Mode
  className?: string
}

const config: Record<Mode, { label: string; className: string }> = {
  direct: {
    label: "Direct Mode",
    className:
      "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-400",
  },
  proxy: {
    label: "Proxy Mode",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-400",
  },
  both: {
    label: "Direct & Proxy",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-400",
  },
}

export function ModeBadge({ mode, className }: ModeBadgeProps) {
  const { label, className: styles } = config[mode]

  return (
    <span
      data-slot="mode-badge"
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold",
        styles,
        className
      )}
    >
      {label}
    </span>
  )
}
