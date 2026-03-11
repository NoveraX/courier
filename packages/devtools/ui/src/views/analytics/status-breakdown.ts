import type { RequestEntry } from "../../store"

export interface StatusSlice {
  code: string
  count: number
  color: string
  percent: number
}

export function computeStatusBreakdown(requests: RequestEntry[]): StatusSlice[] {
  const completed = requests.filter((r) => r.status !== "pending")
  const map = new Map<string, number>()

  for (const r of completed) {
    const code = r.statusCode ? `${Math.floor(r.statusCode / 100)}xx` : (r.status === "error" ? "Error" : "Other")
    map.set(code, (map.get(code) ?? 0) + 1)
  }

  const colors: Record<string, string> = {
    "2xx": "bg-emerald-500", "3xx": "bg-amber-500", "4xx": "bg-red-400",
    "5xx": "bg-red-600", Error: "bg-rose-500", Other: "bg-zinc-500",
  }

  const total = completed.length || 1
  return Array.from(map, ([code, count]) => ({
    code, count, color: colors[code] ?? "bg-zinc-500", percent: (count / total) * 100,
  })).sort((a, b) => b.count - a.count)
}
