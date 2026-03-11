import type { RequestEntry } from "../../store"

// ── Constants ───────────────────────────────────────────────────────────────

export const SLOW_STEP_MS = 5
export const OVERHEAD_WARN_PERCENT = 20
export const MAX_DURATION_WARN_MS = 10

// ── Types ───────────────────────────────────────────────────────────────────

export interface MiddlewareStep {
  name: string
  index: number
  duration: number
  phase: "request" | "response"
  headersAdded?: string[]
  hasError?: boolean
  isCacheHit?: boolean
  isRetry?: boolean
}

export interface MiddlewareStats {
  name: string
  calls: number
  avgDuration: number
  maxDuration: number
  errors: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function guessMiddlewareName(
  index: number,
  headers: Record<string, string[]>,
): string {
  const knownNames = ["auth", "rateLimit", "retry", "log", "cache"]
  const headerSources = new Set(Object.values(headers).flat())
  for (const name of headerSources) {
    if (!knownNames.includes(name)) knownNames.push(name)
  }
  if (index < knownNames.length) return knownNames[index]!
  return `middleware_${index}`
}

export function estimateMiddlewareSteps(r: RequestEntry): MiddlewareStep[] {
  if (r.middlewareCount === 0 || !r.timing) return []

  const perMiddleware = r.timing.middleware / Math.max(r.middlewareCount * 2, 1)
  const steps: MiddlewareStep[] = []
  const middlewareHeaders = r.middlewareHeaders ?? {}

  for (let i = 0; i < r.middlewareCount; i++) {
    const name = guessMiddlewareName(i, middlewareHeaders)
    const headersAdded = Object.entries(middlewareHeaders)
      .filter(([, sources]) => sources.includes(name))
      .map(([header]) => header)

    steps.push({
      name, index: i, duration: perMiddleware, phase: "request",
      headersAdded: headersAdded.length > 0 ? headersAdded : undefined,
      isCacheHit: name.toLowerCase().includes("cache") && r.timing.fetch === 0,
    })
  }

  for (let i = r.middlewareCount - 1; i >= 0; i--) {
    const reqStep = steps[i]!
    steps.push({
      name: reqStep.name, index: i, duration: perMiddleware, phase: "response",
      hasError: i === r.middlewareCount - 1 && r.status === "error",
    })
  }

  return steps
}

export function getOverheadPercent(r: RequestEntry): number {
  if (!r.timing || r.timing.total === 0) return 0
  return (r.timing.middleware / r.timing.total) * 100
}

export function computeAggregateStats(requests: RequestEntry[]): MiddlewareStats[] {
  const map = new Map<string, { total: number; max: number; count: number; errors: number }>()

  for (const r of requests) {
    if (r.middlewareCount === 0 || !r.timing) continue
    const perMw = r.timing.middleware / Math.max(r.middlewareCount, 1)
    const mwHeaders = r.middlewareHeaders ?? {}

    for (let i = 0; i < r.middlewareCount; i++) {
      const name = guessMiddlewareName(i, mwHeaders)
      const entry = map.get(name) ?? { total: 0, max: 0, count: 0, errors: 0 }
      entry.total += perMw
      entry.max = Math.max(entry.max, perMw)
      entry.count += 1
      if (r.status === "error") entry.errors += 1
      map.set(name, entry)
    }
  }

  return Array.from(map, ([name, s]) => ({
    name, calls: s.count, avgDuration: s.total / s.count, maxDuration: s.max, errors: s.errors,
  })).sort((a, b) => b.avgDuration - a.avgDuration)
}
