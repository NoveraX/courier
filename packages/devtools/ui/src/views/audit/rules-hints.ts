import type { SourceMap, RequestEntry } from "../../store"
import type { FlatEndpoint } from "../explorer/helpers"
import type { AuditItem } from "./types"
import {
  ERROR_RATE_THRESHOLD,
  MIN_CALLS_FOR_CACHE_HINT,
  LARGE_GROUP_ENDPOINT_COUNT,
} from "./constants"

export function collectHints(
  sourceMap: SourceMap,
  endpoints: FlatEndpoint[],
  epDurations: Map<string, number[]>,
  epErrors: Map<string, { total: number; transportErrors: number; validationErrors: number }>,
  nextId: () => string
): AuditItem[] {
  const items: AuditItem[] = []

  for (const ep of endpoints) {
    if (ep.type === "query" && !ep.middleware.includes("cache")) {
      const key = `${ep.source}.${ep.group}.${ep.method}`
      const callCount = epDurations.get(key)?.length ?? 0
      if (callCount >= MIN_CALLS_FOR_CACHE_HINT) {
        items.push({ id: nextId(), severity: "hint", title: "Consider caching", description: `${key} is a query endpoint called ${callCount} times with no caching.`, suggestion: `Add cacheMiddleware({ ttl: 60 }) to the middleware chain.`, endpoint: key, category: "performance" })
      }
    }
  }

  for (const ep of endpoints) {
    if (!ep.middleware.includes("retry")) {
      const key = `${ep.source}.${ep.group}.${ep.method}`
      const stats = epErrors.get(key)
      if (stats && stats.transportErrors > 0 && stats.transportErrors / stats.total < ERROR_RATE_THRESHOLD) {
        items.push({ id: nextId(), severity: "hint", title: "Consider retry middleware", description: `${key} has occasional transport errors but no retry middleware.`, suggestion: "Add retryMiddleware({ maxRetries: 3, backoff: 'exponential' }) to handle transient failures.", endpoint: key, category: "reliability" })
      }
    }
  }

  for (const [sourceName, source] of Object.entries(sourceMap)) {
    for (const [groupName, group] of Object.entries(source.groups ?? {})) {
      const epCount = Object.keys(group.endpoints ?? {}).length
      if (epCount > LARGE_GROUP_ENDPOINT_COUNT) {
        items.push({ id: nextId(), severity: "hint", title: "Large group", description: `${sourceName}.${groupName} has ${epCount} endpoints.`, suggestion: "Consider splitting into smaller, more focused groups.", endpoint: `${sourceName}.${groupName}`, category: "structure" })
      }
    }
  }

  return items
}

export function collectPasses(
  endpoints: FlatEndpoint[],
  requests: RequestEntry[],
  nextId: () => string
): AuditItem[] {
  const items: AuditItem[] = []

  if (endpoints.every((ep) => ep.hasResponseSchema) && endpoints.length > 0) {
    items.push({ id: nextId(), severity: "pass", title: "All endpoints have response validation", description: "Every endpoint has a response schema defined for runtime type-checking.", category: "validation" })
  }

  const mutations = endpoints.filter((ep) => ep.type === "mutation")
  if (mutations.every((ep) => ep.hasVariablesSchema) && mutations.length > 0) {
    items.push({ id: nextId(), severity: "pass", title: "All mutations have input validation", description: "Every mutation endpoint validates its input with a schema.", category: "validation" })
  }

  if (endpoints.some((ep) => ep.middleware.includes("auth"))) {
    items.push({ id: nextId(), severity: "pass", title: "Auth middleware applied", description: "Auth middleware is configured on one or more endpoints.", category: "security" })
  }

  if (endpoints.some((ep) => ep.middleware.some((mw) => mw.includes("error")))) {
    items.push({ id: nextId(), severity: "pass", title: "Error middleware in chain", description: "Error handling middleware is configured on one or more endpoints.", category: "reliability" })
  }

  if (endpoints.some((ep) => ep.middleware.includes("log"))) {
    items.push({ id: nextId(), severity: "pass", title: "Logging middleware present", description: "Logging middleware is active for request tracking.", category: "observability" })
  }

  const recentErrors = requests.filter((r) => r.status === "error" || r.status === "validation_error")
  if (requests.length > 0 && recentErrors.length === 0) {
    items.push({ id: nextId(), severity: "pass", title: "No errors in current session", description: `All ${requests.length} requests completed successfully.`, category: "reliability" })
  }

  return items
}
