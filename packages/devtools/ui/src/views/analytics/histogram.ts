import type { RequestEntry } from "../../store"

export interface HistogramBucket {
  label: string
  count: number
  maxCount: number
  successCount: number
  errorCount: number
}

export function computeHistogram(requests: RequestEntry[]): HistogramBucket[] {
  const buckets = [
    { label: "<50ms", min: 0, max: 50 },
    { label: "50-100", min: 50, max: 100 },
    { label: "100-200", min: 100, max: 200 },
    { label: "200-500", min: 200, max: 500 },
    { label: "500ms-1s", min: 500, max: 1000 },
    { label: ">1s", min: 1000, max: Infinity },
  ]

  const counts = buckets.map((b) => ({ label: b.label, count: 0, successCount: 0, errorCount: 0, maxCount: 0 }))

  for (const r of requests) {
    if (!r.timing || r.status === "pending") continue
    const t = r.timing.total
    for (let i = 0; i < buckets.length; i++) {
      if (t >= buckets[i]!.min && t < buckets[i]!.max) {
        counts[i]!.count++
        if (r.status === "success") counts[i]!.successCount++
        else counts[i]!.errorCount++
        break
      }
    }
  }

  const max = Math.max(1, ...counts.map((c) => c.count))
  for (const c of counts) c.maxCount = max
  return counts
}
