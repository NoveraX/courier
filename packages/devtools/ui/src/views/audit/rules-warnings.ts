import type { SourceMap } from "../../store"
import type { FlatEndpoint } from "../explorer/helpers"
import type { AuditItem } from "./types"
import {
  P95_THRESHOLD_MS,
  ERROR_RATE_THRESHOLD,
  MIN_SAMPLES_FOR_P95,
  LARGE_PAYLOAD_BYTES,
} from "./constants"

export function collectWarnings(
  sourceMap: SourceMap,
  endpoints: FlatEndpoint[],
  epDurations: Map<string, number[]>,
  epErrors: Map<string, { total: number; transportErrors: number; validationErrors: number }>,
  epSizes: Map<string, number[]>,
  nextId: () => string
): AuditItem[] {
  const items: AuditItem[] = []

  for (const ep of endpoints) {
    if (!ep.hasResponseSchema) {
      items.push({ id: nextId(), severity: "warning", title: "No response validation", description: `${ep.source}.${ep.group}.${ep.method} has no response validation schema.`, suggestion: `Add response schema: endpoint<T>().schema({ response: z.object({...}) })`, endpoint: `${ep.source}.${ep.group}.${ep.method}`, category: "validation" })
    }
  }

  for (const ep of endpoints) {
    if (ep.type === "mutation" && !ep.hasVariablesSchema) {
      items.push({ id: nextId(), severity: "warning", title: "Mutation without input validation", description: `${ep.source}.${ep.group}.${ep.method} is a mutation without variables validation.`, suggestion: `Add variables schema: endpoint<R, V>().schema({ variables: z.object({...}) })`, endpoint: `${ep.source}.${ep.group}.${ep.method}`, category: "validation" })
    }
  }

  for (const [sourceName, source] of Object.entries(sourceMap)) {
    for (const [groupName, group] of Object.entries(source.groups ?? {})) {
      const allEps = Object.values(group.endpoints ?? {})
      if (!allEps.some((ep) => (ep.middleware?.length ?? 0) > 0) && allEps.length > 0) {
        items.push({ id: nextId(), severity: "warning", title: "Group without middleware", description: `${sourceName}.${groupName} has no middleware on any endpoint.`, suggestion: "Add at least logging middleware to track requests and auth middleware for protected routes.", endpoint: `${sourceName}.${groupName}`, category: "middleware" })
      }
    }
  }

  for (const ep of endpoints) {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const mw of ep.middleware) { if (seen.has(mw)) duplicates.push(mw); seen.add(mw) }
    if (duplicates.length > 0) {
      items.push({ id: nextId(), severity: "warning", title: "Duplicate middleware", description: `${ep.source}.${ep.group}.${ep.method} has duplicate middleware: ${duplicates.join(", ")}.`, suggestion: "Remove duplicate middleware entries from the chain.", endpoint: `${ep.source}.${ep.group}.${ep.method}`, category: "middleware" })
    }
  }

  for (const [epKey, durations] of epDurations) {
    if (durations.length >= MIN_SAMPLES_FOR_P95) {
      const sorted = [...durations].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]!
      if (p95 > P95_THRESHOLD_MS) {
        items.push({ id: nextId(), severity: "warning", title: "Slow endpoint", description: `${epKey} has P95 response time of ${Math.round(p95)}ms (${durations.length} samples).`, suggestion: "Add cacheMiddleware({ ttl: 60 }) for GET endpoints, or optimize the backend query.", endpoint: epKey, category: "performance" })
      }
    }
  }

  for (const [epKey, stats] of epErrors) {
    if (stats.total >= MIN_SAMPLES_FOR_P95 && stats.transportErrors / stats.total > ERROR_RATE_THRESHOLD) {
      items.push({ id: nextId(), severity: "warning", title: "High error rate", description: `${epKey} has ${Math.round((stats.transportErrors / stats.total) * 100)}% error rate (${stats.transportErrors}/${stats.total} requests).`, suggestion: "Add retryMiddleware for transient failures or investigate the root cause.", endpoint: epKey, category: "reliability" })
    }
  }

  for (const [epKey, sizes] of epSizes) {
    if (sizes.length > 0) {
      const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length
      if (avg > LARGE_PAYLOAD_BYTES) {
        items.push({ id: nextId(), severity: "warning", title: "Large response payload", description: `${epKey} has average response size of ${(avg / 1_048_576).toFixed(1)}MB.`, suggestion: "Consider pagination, field selection, or compression to reduce payload size.", endpoint: epKey, category: "performance" })
      }
    }
  }

  return items
}
