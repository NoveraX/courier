import type { SourceMap, RequestEntry } from "../../store"
import type { FlatEndpoint } from "../explorer/helpers"
import type { AuditSeverity, AuditItem } from "./types"

import { collectErrors } from "./rules-errors"
import { collectWarnings } from "./rules-warnings"
import { collectHints, collectPasses } from "./rules-hints"

export function runAudit(
  sourceMap: SourceMap,
  endpoints: FlatEndpoint[],
  requests: RequestEntry[]
): AuditItem[] {
  let id = 0
  const nextId = () => `audit-${++id}`

  // Pre-compute request analytics
  const epDurations = new Map<string, number[]>()
  const epErrors = new Map<string, { total: number; transportErrors: number; validationErrors: number }>()
  const epSizes = new Map<string, number[]>()

  for (const req of requests) {
    const key = [req.source, req.group, req.method].filter(Boolean).join(".")
    if (req.timing && req.status === "success") {
      const arr = epDurations.get(key) ?? []
      arr.push(req.timing.total)
      epDurations.set(key, arr)
    }
    const stats = epErrors.get(key) ?? { total: 0, transportErrors: 0, validationErrors: 0 }
    stats.total++
    if (req.status === "error") stats.transportErrors++
    if (req.status === "validation_error") stats.validationErrors++
    epErrors.set(key, stats)
    if (req.size != null && req.status === "success") {
      const arr = epSizes.get(key) ?? []
      arr.push(req.size)
      epSizes.set(key, arr)
    }
  }

  const items: AuditItem[] = [
    ...collectErrors(sourceMap, endpoints, nextId),
    ...collectWarnings(sourceMap, endpoints, epDurations, epErrors, epSizes, nextId),
    ...collectHints(sourceMap, endpoints, epDurations, epErrors, nextId),
    ...collectPasses(endpoints, requests, nextId),
  ]

  const order: Record<AuditSeverity, number> = { error: 0, warning: 1, hint: 2, pass: 3 }
  items.sort((a, b) => order[a.severity] - order[b.severity])
  return items
}
