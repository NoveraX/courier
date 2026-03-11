import { formatDuration } from "../../components/ui"

export function TimingRow({
  label,
  value,
  total,
  color,
}: {
  label: string
  value: number
  total: number
  color: string
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-text-muted">{label}</span>
      <div className="flex-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-1">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-text-secondary">
        {formatDuration(value)}
      </span>
    </div>
  )
}
