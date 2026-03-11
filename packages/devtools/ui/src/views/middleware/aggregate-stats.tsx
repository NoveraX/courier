import { formatDuration } from "../../components/ui"

import type { MiddlewareStats } from "./helpers"
import { MAX_DURATION_WARN_MS } from "./helpers"

export function AggregateStatsPanel({ stats }: { stats: MiddlewareStats[] }) {
  if (stats.length === 0) {
    return <div className="flex flex-1 items-center justify-center text-[10px] text-text-muted">No middleware stats</div>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border-subtle text-left text-text-muted">
            <th className="px-3 py-1.5 font-medium">Middleware</th>
            <th className="px-2 py-1.5 font-medium text-right">Calls</th>
            <th className="px-2 py-1.5 font-medium text-right">Avg</th>
            <th className="px-2 py-1.5 font-medium text-right">Max</th>
            <th className="px-2 py-1.5 font-medium text-right">Errors</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.name} className="border-b border-border-subtle">
              <td className="px-3 py-1.5 font-mono text-text-secondary">{s.name}</td>
              <td className="px-2 py-1.5 text-right text-text-muted">{s.calls}</td>
              <td className="px-2 py-1.5 text-right text-text-muted">{formatDuration(s.avgDuration)}</td>
              <td className={`px-2 py-1.5 text-right ${s.maxDuration > MAX_DURATION_WARN_MS ? "text-amber-400" : "text-text-muted"}`}>{formatDuration(s.maxDuration)}</td>
              <td className={`px-2 py-1.5 text-right ${s.errors > 0 ? "text-red-400" : "text-text-muted"}`}>{s.errors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
