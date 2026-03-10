import { useMemo } from "react"
import {
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  ChevronRight,
  Play,
  Info,
} from "lucide-react"

import type { SourceMap, RequestEntry } from "../../store"

import { useDevToolsStore } from "../../store"
import { Badge } from "../../components/ui"
import { mergeSourceMaps, getDemoSourceMap, flattenEndpoints } from "../explorer/helpers"

import type { FlatEndpoint } from "../explorer/helpers"

// ── Audit types ──────────────────────────────────────────────────────────────

type AuditSeverity = "error" | "warning" | "hint" | "pass"

interface AuditItem {
  id: string
  severity: AuditSeverity
  title: string
  description: string
  suggestion?: string
  endpoint?: string
  category: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const P95_THRESHOLD_MS = 1000
const ERROR_RATE_THRESHOLD = 0.3
const MIN_SAMPLES_FOR_P95 = 3
const MIN_CALLS_FOR_CACHE_HINT = 5
const LARGE_PAYLOAD_BYTES = 1_048_576 // 1MB
const LARGE_GROUP_ENDPOINT_COUNT = 10

const SEVERITY_CONFIG: Record<
  AuditSeverity,
  { icon: typeof AlertCircle; color: string; bgColor: string; label: string }
> = {
  error: {
    icon: AlertCircle,
    color: "text-red-400",
    bgColor: "bg-red-500/10 border-red-500/20",
    label: "Error",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10 border-amber-500/20",
    label: "Warning",
  },
  hint: {
    icon: Lightbulb,
    color: "text-sky-400",
    bgColor: "bg-sky-500/10 border-sky-500/20",
    label: "Hint",
  },
  pass: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    label: "Pass",
  },
}

// ── Audit View ───────────────────────────────────────────────────────────────

export function AuditView() {
  const { sessions, requests, auditFilter, auditExpandedIds, setAuditFilter, toggleAuditExpanded, setActiveTab } =
    useDevToolsStore()

  const merged = useMemo(() => mergeSourceMaps(sessions), [sessions])
  const isDemo = Object.keys(merged).length === 0

  const sourceMap: SourceMap = useMemo(
    () => (isDemo ? getDemoSourceMap() : merged),
    [merged, isDemo],
  )

  const endpoints = useMemo(() => flattenEndpoints(sourceMap), [sourceMap])

  const auditItems = useMemo(
    () => runAudit(sourceMap, endpoints, isDemo ? [] : requests),
    [sourceMap, endpoints, requests, isDemo],
  )

  const filtered = useMemo(
    () =>
      auditFilter === "all"
        ? auditItems
        : auditItems.filter((i) => i.severity === auditFilter),
    [auditItems, auditFilter],
  )

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, hint: 0, pass: 0 }
    for (const item of auditItems) c[item.severity]++
    return c
  }, [auditItems])

  const { sourceCount, groupCount } = useMemo(() => ({
    sourceCount: Object.keys(sourceMap).length,
    groupCount: Object.values(sourceMap).reduce(
      (acc, s) => acc + Object.keys(s.groups ?? {}).length,
      0,
    ),
  }), [sourceMap])

  function handleFilterClick(severity: AuditSeverity) {
    setAuditFilter(auditFilter === severity ? "all" : severity)
  }

  function handleOpenInPlayground(endpoint: string) {
    const parts = endpoint.split(".")
    if (parts.length >= 3) {
      setActiveTab("playground")
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border-default bg-surface-0 px-4 py-2">
        <ShieldCheck size={16} className="shrink-0 text-text-muted" />
        <span className="text-xs font-medium text-text-secondary">Audit</span>
        <div className="ml-auto text-[10px] text-text-muted">
          {sourceCount} sources &middot; {groupCount} groups &middot; {endpoints.length} endpoints
        </div>
      </div>

      {/* Demo data banner */}
      {isDemo && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <Info size={14} className="shrink-0 text-amber-400" />
          <span className="text-[11px] text-amber-300">
            No connected sessions — showing audit of demo data. Connect your app for real analysis.
          </span>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2 border-b border-border-default bg-surface-0 px-4 py-3">
        {(["error", "warning", "hint", "pass"] as const).map((severity) => {
          const config = SEVERITY_CONFIG[severity]
          const Icon = config.icon
          return (
            <button
              key={severity}
              type="button"
              onClick={() => handleFilterClick(severity)}
              className={`flex items-center gap-2 rounded-lg border p-2.5 transition-colors ${
                auditFilter === severity
                  ? config.bgColor + " border-current"
                  : "border-border-default bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <Icon size={16} className={config.color} />
              <div className="text-left">
                <div className="text-sm font-semibold text-text-primary">{counts[severity]}</div>
                <div className="text-[10px] text-text-muted">{config.label}s</div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Audit items */}
      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-text-muted">
            <CheckCircle2 size={32} strokeWidth={1} />
            <p className="text-xs">
              {auditFilter === "all" ? "No issues found" : `No ${auditFilter}s found`}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const config = SEVERITY_CONFIG[item.severity]
              const Icon = config.icon
              const isExpanded = auditExpandedIds.has(item.id)

              return (
                <div
                  key={item.id}
                  className={`rounded-lg border transition-colors ${config.bgColor}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleAuditExpanded(item.id)}
                    className="flex w-full items-start gap-2.5 p-3 text-left"
                  >
                    <Icon size={14} className={`mt-0.5 shrink-0 ${config.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text-primary">
                          {item.title}
                        </span>
                        <Badge variant="zinc">{item.category}</Badge>
                        {item.endpoint && (
                          <span className="truncate font-mono text-[10px] text-text-muted">
                            {item.endpoint}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-secondary">{item.description}</p>
                    </div>
                    <ChevronRight
                      size={12}
                      className={`mt-1 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border-subtle px-3 py-2.5 pl-9">
                      {item.suggestion && (
                        <p className="text-[11px] text-text-muted">
                          <span className="font-medium text-text-secondary">Suggestion: </span>
                          {item.suggestion}
                        </p>
                      )}
                      {item.endpoint && item.endpoint.split(".").length >= 3 && (
                        <button
                          type="button"
                          onClick={() => handleOpenInPlayground(item.endpoint!)}
                          className="mt-2 flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
                        >
                          <Play size={10} />
                          Open in Playground
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Audit engine ─────────────────────────────────────────────────────────────

function runAudit(
  sourceMap: SourceMap,
  endpoints: FlatEndpoint[],
  requests: RequestEntry[],
): AuditItem[] {
  const items: AuditItem[] = []
  let id = 0
  const nextId = () => `audit-${++id}`

  // ── Pre-compute request analytics ──────────────────────────────────────

  const epDurations = new Map<string, number[]>()
  const epErrors = new Map<string, { total: number; transportErrors: number; validationErrors: number }>()
  const epSizes = new Map<string, number[]>()

  for (const req of requests) {
    const key = `${req.source}.${req.group ?? "?"}.${req.method}`

    // Timing data (successful requests only)
    if (req.timing && req.status === "success") {
      const arr = epDurations.get(key) ?? []
      arr.push(req.timing.total)
      epDurations.set(key, arr)
    }

    // Error tracking — separate transport vs validation errors
    const stats = epErrors.get(key) ?? { total: 0, transportErrors: 0, validationErrors: 0 }
    stats.total++
    if (req.status === "error") stats.transportErrors++
    if (req.status === "validation_error") stats.validationErrors++
    epErrors.set(key, stats)

    // Response size tracking
    if (req.size != null && req.status === "success") {
      const arr = epSizes.get(key) ?? []
      arr.push(req.size)
      epSizes.set(key, arr)
    }
  }

  // ── Errors ──────────────────────────────────────────────────────────────

  // Source with no groups
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    if (Object.keys(source.groups ?? {}).length === 0) {
      items.push({
        id: nextId(),
        severity: "error",
        title: "Empty source",
        description: `Source "${sourceName}" has no groups defined.`,
        suggestion: "Add at least one group with endpoints to this source.",
        endpoint: sourceName,
        category: "structure",
      })
    }
  }

  // Source with invalid baseURL
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    if (!source.baseURL || !isValidURL(source.baseURL)) {
      items.push({
        id: nextId(),
        severity: "error",
        title: "Invalid base URL",
        description: `Source "${sourceName}" has an invalid or empty baseURL: "${source.baseURL || "(empty)"}"`,
        suggestion: "Set a valid base URL: defineApi({ baseURL: 'https://api.example.com', ... })",
        endpoint: sourceName,
        category: "structure",
      })
    }
  }

  // Endpoints with no middleware and no validation (completely unprotected)
  for (const ep of endpoints) {
    if (ep.middleware.length === 0 && !ep.hasVariablesSchema && !ep.hasResponseSchema) {
      items.push({
        id: nextId(),
        severity: "error",
        title: "No error handling",
        description: `${ep.source}.${ep.group}.${ep.method} has no middleware and no validation schemas.`,
        suggestion:
          "Add at least error handling middleware or validation schemas to protect against unexpected responses.",
        endpoint: `${ep.source}.${ep.group}.${ep.method}`,
        category: "reliability",
      })
    }
  }

  // ── Warnings ────────────────────────────────────────────────────────────

  // Endpoints without response validation
  for (const ep of endpoints) {
    if (!ep.hasResponseSchema) {
      items.push({
        id: nextId(),
        severity: "warning",
        title: "No response validation",
        description: `${ep.source}.${ep.group}.${ep.method} has no response validation schema. Response data is not type-checked at runtime.`,
        suggestion: `Add response schema: endpoint<T>().schema({ response: z.object({...}) })`,
        endpoint: `${ep.source}.${ep.group}.${ep.method}`,
        category: "validation",
      })
    }
  }

  // Endpoints without variables validation (mutations only)
  for (const ep of endpoints) {
    if (ep.type === "mutation" && !ep.hasVariablesSchema) {
      items.push({
        id: nextId(),
        severity: "warning",
        title: "Mutation without input validation",
        description: `${ep.source}.${ep.group}.${ep.method} is a mutation without variables validation. Input data is unchecked.`,
        suggestion: `Add variables schema: endpoint<R, V>().schema({ variables: z.object({...}) })`,
        endpoint: `${ep.source}.${ep.group}.${ep.method}`,
        category: "validation",
      })
    }
  }

  // Groups with no middleware
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    for (const [groupName, group] of Object.entries(source.groups ?? {})) {
      const allEps = Object.values(group.endpoints ?? {})
      const hasAnyMiddleware = allEps.some((ep) => (ep.middleware?.length ?? 0) > 0)
      if (!hasAnyMiddleware && allEps.length > 0) {
        items.push({
          id: nextId(),
          severity: "warning",
          title: "Group without middleware",
          description: `${sourceName}.${groupName} has no middleware on any endpoint. No auth, no logging, no error handling.`,
          suggestion:
            "Add at least logging middleware to track requests and auth middleware for protected routes.",
          endpoint: `${sourceName}.${groupName}`,
          category: "middleware",
        })
      }
    }
  }

  // Duplicate middleware in chain
  for (const ep of endpoints) {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const mw of ep.middleware) {
      if (seen.has(mw)) duplicates.push(mw)
      seen.add(mw)
    }
    if (duplicates.length > 0) {
      items.push({
        id: nextId(),
        severity: "warning",
        title: "Duplicate middleware",
        description: `${ep.source}.${ep.group}.${ep.method} has duplicate middleware: ${duplicates.join(", ")}. Each middleware runs twice per request.`,
        suggestion: "Remove duplicate middleware entries from the chain.",
        endpoint: `${ep.source}.${ep.group}.${ep.method}`,
        category: "middleware",
      })
    }
  }

  // Slow endpoints (P95 > threshold)
  for (const [epKey, durations] of epDurations) {
    if (durations.length >= MIN_SAMPLES_FOR_P95) {
      const sorted = [...durations].sort((a, b) => a - b)
      const p95 = sorted[Math.floor(sorted.length * 0.95)]!
      if (p95 > P95_THRESHOLD_MS) {
        items.push({
          id: nextId(),
          severity: "warning",
          title: "Slow endpoint",
          description: `${epKey} has P95 response time of ${Math.round(p95)}ms (${durations.length} samples). Consider adding caching or optimizing the backend.`,
          suggestion: "Add cacheMiddleware({ ttl: 60 }) for GET endpoints, or optimize the backend query.",
          endpoint: epKey,
          category: "performance",
        })
      }
    }
  }

  // High error rate (transport errors only, not validation)
  for (const [epKey, stats] of epErrors) {
    if (stats.total >= MIN_SAMPLES_FOR_P95 && stats.transportErrors / stats.total > ERROR_RATE_THRESHOLD) {
      items.push({
        id: nextId(),
        severity: "warning",
        title: "High error rate",
        description: `${epKey} has ${Math.round((stats.transportErrors / stats.total) * 100)}% error rate (${stats.transportErrors}/${stats.total} requests).`,
        suggestion: "Add retryMiddleware for transient failures or investigate the root cause.",
        endpoint: epKey,
        category: "reliability",
      })
    }
  }

  // Large response payloads (>1MB average)
  for (const [epKey, sizes] of epSizes) {
    if (sizes.length > 0) {
      const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length
      if (avg > LARGE_PAYLOAD_BYTES) {
        items.push({
          id: nextId(),
          severity: "warning",
          title: "Large response payload",
          description: `${epKey} has average response size of ${(avg / 1_048_576).toFixed(1)}MB. Large payloads impact client performance.`,
          suggestion: "Consider pagination, field selection, or compression to reduce payload size.",
          endpoint: epKey,
          category: "performance",
        })
      }
    }
  }

  // ── Hints ───────────────────────────────────────────────────────────────

  // GET endpoints without cache middleware (called frequently)
  for (const ep of endpoints) {
    if (ep.type === "query" && !ep.middleware.includes("cache")) {
      const key = `${ep.source}.${ep.group}.${ep.method}`
      const durations = epDurations.get(key)
      const callCount = durations?.length ?? 0
      if (callCount >= MIN_CALLS_FOR_CACHE_HINT) {
        items.push({
          id: nextId(),
          severity: "hint",
          title: "Consider caching",
          description: `${key} is a query endpoint called ${callCount} times with no caching. Adding cache middleware could reduce backend load.`,
          suggestion: `Add cacheMiddleware({ ttl: 60 }) to the middleware chain.`,
          endpoint: key,
          category: "performance",
        })
      }
    }
  }

  // Endpoints without retry middleware that have transport errors (NOT validation errors)
  for (const ep of endpoints) {
    if (!ep.middleware.includes("retry")) {
      const key = `${ep.source}.${ep.group}.${ep.method}`
      const stats = epErrors.get(key)
      if (stats && stats.transportErrors > 0 && stats.transportErrors / stats.total < ERROR_RATE_THRESHOLD) {
        items.push({
          id: nextId(),
          severity: "hint",
          title: "Consider retry middleware",
          description: `${key} has occasional transport errors but no retry middleware. Adding retry could improve reliability.`,
          suggestion: "Add retryMiddleware({ maxRetries: 3, backoff: 'exponential' }) to handle transient failures.",
          endpoint: key,
          category: "reliability",
        })
      }
    }
  }

  // Groups with many endpoints — consider splitting
  for (const [sourceName, source] of Object.entries(sourceMap)) {
    for (const [groupName, group] of Object.entries(source.groups ?? {})) {
      const epCount = Object.keys(group.endpoints ?? {}).length
      if (epCount > LARGE_GROUP_ENDPOINT_COUNT) {
        items.push({
          id: nextId(),
          severity: "hint",
          title: "Large group",
          description: `${sourceName}.${groupName} has ${epCount} endpoints. Large groups can be harder to maintain.`,
          suggestion: "Consider splitting into smaller, more focused groups for better organization.",
          endpoint: `${sourceName}.${groupName}`,
          category: "structure",
        })
      }
    }
  }

  // ── Best Practices (pass) ──────────────────────────────────────────────

  // All endpoints have response validation
  const allHaveResponseSchema = endpoints.every((ep) => ep.hasResponseSchema)
  if (allHaveResponseSchema && endpoints.length > 0) {
    items.push({
      id: nextId(),
      severity: "pass",
      title: "All endpoints have response validation",
      description: "Every endpoint has a response schema defined for runtime type-checking.",
      category: "validation",
    })
  }

  // All mutations have variables validation
  const mutations = endpoints.filter((ep) => ep.type === "mutation")
  const allMutationsHaveVarsSchema = mutations.every((ep) => ep.hasVariablesSchema)
  if (allMutationsHaveVarsSchema && mutations.length > 0) {
    items.push({
      id: nextId(),
      severity: "pass",
      title: "All mutations have input validation",
      description: "Every mutation endpoint validates its input with a schema.",
      category: "validation",
    })
  }

  // Auth middleware present
  const hasAuth = endpoints.some((ep) => ep.middleware.includes("auth"))
  if (hasAuth) {
    items.push({
      id: nextId(),
      severity: "pass",
      title: "Auth middleware applied",
      description: "Auth middleware is configured on one or more endpoints.",
      category: "security",
    })
  }

  // Error middleware present
  const hasError = endpoints.some((ep) =>
    ep.middleware.some((mw) => mw.includes("error")),
  )
  if (hasError) {
    items.push({
      id: nextId(),
      severity: "pass",
      title: "Error middleware in chain",
      description: "Error handling middleware is configured on one or more endpoints.",
      category: "reliability",
    })
  }

  // Logging middleware present
  const hasLogging = endpoints.some((ep) => ep.middleware.includes("log"))
  if (hasLogging) {
    items.push({
      id: nextId(),
      severity: "pass",
      title: "Logging middleware present",
      description: "Logging middleware is active for request tracking.",
      category: "observability",
    })
  }

  // No errors in recent requests
  const recentErrors = requests.filter(
    (r) => r.status === "error" || r.status === "validation_error",
  )
  if (requests.length > 0 && recentErrors.length === 0) {
    items.push({
      id: nextId(),
      severity: "pass",
      title: "No errors in current session",
      description: `All ${requests.length} requests completed successfully.`,
      category: "reliability",
    })
  }

  // Sort: errors first, then warnings, hints, pass
  const order: Record<AuditSeverity, number> = { error: 0, warning: 1, hint: 2, pass: 3 }
  items.sort((a, b) => order[a.severity] - order[b.severity])

  return items
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isValidURL(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
