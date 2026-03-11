const BADGE_COLORS: Record<string, string> = {
  violet: "bg-violet-500/15 text-violet-400",
  sky: "bg-sky-500/15 text-sky-400",
  emerald: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
  zinc: "bg-zinc-500/15 text-zinc-400",
  rose: "bg-rose-500/15 text-rose-400",
  orange: "bg-orange-500/15 text-orange-400",
  indigo: "bg-indigo-500/15 text-indigo-400",
}

export type BadgeVariant = keyof typeof BADGE_COLORS

export function Badge({
  children,
  variant,
}: {
  children: React.ReactNode
  variant: BadgeVariant
}) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none ${BADGE_COLORS[variant]}`}
    >
      {children}
    </span>
  )
}
