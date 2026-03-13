import { useMemo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { ShieldCheck, CheckCircle2, ChevronRight, Play, Info } from "lucide-react"

import type { SourceMap } from "../../store"

import { useDevToolsStore } from "../../store"
import { Badge } from "../../components/ui"
import { mergeSourceMaps, getDemoSourceMap, flattenEndpoints } from "../explorer/helpers"

import type { AuditSeverity } from "./types"
import { SEVERITY_CONFIG } from "./constants"
import { runAudit } from "./run-audit"

export function AuditView() {
  const { sessions, requests, auditFilter, auditExpandedIds, setAuditFilter, toggleAuditExpanded } =
    useDevToolsStore()
  const navigate = useNavigate()

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
    () => auditFilter === "all" ? auditItems : auditItems.filter((i) => i.severity === auditFilter),
    [auditItems, auditFilter],
  )

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, hint: 0, pass: 0 }
    for (const item of auditItems) c[item.severity]++
    return c
  }, [auditItems])

  const { sourceCount, groupCount } = useMemo(() => ({
    sourceCount: Object.keys(sourceMap).length,
    groupCount: Object.values(sourceMap).reduce((acc, s) => acc + Object.keys(s.groups ?? {}).length, 0),
  }), [sourceMap])

  function handleFilterClick(severity: AuditSeverity) {
    setAuditFilter(auditFilter === severity ? "all" : severity)
  }

  function handleOpenInPlayground(endpoint: string) {
    const parts = endpoint.split(".")
    if (parts.length >= 3) void navigate({ to: "/playground" })
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
            <p className="text-xs">{auditFilter === "all" ? "No issues found" : `No ${auditFilter}s found`}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => {
              const config = SEVERITY_CONFIG[item.severity]
              const Icon = config.icon
              const isExpanded = auditExpandedIds.has(item.id)

              return (
                <div key={item.id} className={`rounded-lg border transition-colors ${config.bgColor}`}>
                  <button type="button" onClick={() => toggleAuditExpanded(item.id)} className="flex w-full items-start gap-2.5 p-3 text-left">
                    <Icon size={14} className={`mt-0.5 shrink-0 ${config.color}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-text-primary">{item.title}</span>
                        <Badge variant="zinc">{item.category}</Badge>
                        {item.endpoint && <span className="truncate font-mono text-[10px] text-text-muted">{item.endpoint}</span>}
                      </div>
                      <p className="mt-0.5 text-[11px] text-text-secondary">{item.description}</p>
                    </div>
                    <ChevronRight size={12} className={`mt-1 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`} />
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
                        <button type="button" onClick={() => handleOpenInPlayground(item.endpoint!)} className="mt-2 flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-[10px] font-medium text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary">
                          <Play size={10} /> Open in Playground
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
