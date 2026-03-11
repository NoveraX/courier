import { TrendingUp, TrendingDown, Minus } from "lucide-react"

export function KPICard({
  label,
  value,
  color = "text-text-primary",
  trend: trendDir,
}: {
  label: string
  value: string
  color?: string
  trend?: "up" | "down" | "flat"
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-0 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className={`text-lg font-semibold ${color}`}>{value}</span>
        {trendDir === "up" && <TrendingUp size={12} className="text-red-400" />}
        {trendDir === "down" && <TrendingDown size={12} className="text-emerald-400" />}
        {trendDir === "flat" && <Minus size={12} className="text-text-muted" />}
      </div>
    </div>
  )
}
