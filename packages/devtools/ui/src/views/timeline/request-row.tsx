import { useState, useEffect } from "react"
import { Pin } from "lucide-react"

import type { RequestEntry } from "../../store"

import { Badge, formatRelativeTime, formatAbsoluteTime, formatSize } from "../../components/ui"
import { STATUS_CONFIG, HTTP_METHOD_COLORS, getCodeColor } from "./constants"

// ── Request Row ──────────────────────────────────────────────────────────────

export function RequestRow({
  request,
  selected,
  onSelect,
  onTogglePin,
  onContextMenu,
}: {
  request: RequestEntry
  selected: boolean
  onSelect: () => void
  onTogglePin: () => void
  onContextMenu: (e: React.MouseEvent) => void
}) {
  const [, setTick] = useState(0)
  const statusCfg = STATUS_CONFIG[request.status]
  const label = [request.source, request.group, request.method].filter(Boolean).join(".")
  const codeColor = request.statusCode ? getCodeColor(request.statusCode) : ""

  // Tick every 10s for relative timestamps on pending requests
  useEffect(() => {
    if (request.status !== "pending") return
    const interval = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(interval)
  }, [request.status])

  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`group flex h-full w-full items-center gap-2 px-3 text-left text-[12px] transition-colors ${
        selected
          ? "bg-surface-2"
          : request.pinned
            ? "bg-amber-500/5 hover:bg-surface-1"
            : "hover:bg-surface-1"
      }`}
    >
      {/* Status dot */}
      <div className="flex w-3 justify-center">
        <div className={`h-2 w-2 rounded-full ${statusCfg.dotClass}`} title={statusCfg.label} />
      </div>

      {/* HTTP method */}
      {request.httpMethod && (
        <span
          className={`w-9 shrink-0 text-[10px] font-bold tabular-nums ${
            HTTP_METHOD_COLORS[request.httpMethod] ?? "text-text-muted"
          }`}
        >
          {request.httpMethod}
        </span>
      )}

      {/* Mode badge */}
      <Badge variant={request.mode === "proxy" ? "violet" : "sky"}>{request.mode}</Badge>

      {/* Type badge */}
      {request.type && (
        <Badge variant={request.type === "query" ? "emerald" : "amber"}>
          {request.type === "query" ? "Q" : "M"}
        </Badge>
      )}

      {/* Endpoint path */}
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text-secondary">
        {label}
      </span>

      {/* Pinned indicator */}
      {request.pinned && <Pin size={10} className="shrink-0 fill-amber-400 text-amber-400" />}

      {/* Pin button (on hover) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin()
        }}
        className={`hidden shrink-0 group-hover:block ${
          request.pinned ? "text-amber-400" : "text-text-muted hover:text-text-secondary"
        }`}
        title={request.pinned ? "Unpin" : "Pin"}
      >
        <Pin size={10} />
      </button>

      {/* Status code */}
      {request.statusCode != null && (
        <span className={`w-7 shrink-0 text-right text-[11px] font-medium tabular-nums ${codeColor}`}>
          {request.statusCode}
        </span>
      )}

      {/* Size */}
      {request.size != null && request.size > 0 && (
        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
          {formatSize(request.size)}
        </span>
      )}

      {/* Duration */}
      {request.timing ? (
        <span
          className={`w-12 shrink-0 text-right text-[11px] tabular-nums ${
            request.timing.total > 500
              ? "text-red-400"
              : request.timing.total > 100
                ? "text-amber-400"
                : "text-emerald-400"
          }`}
        >
          {Math.round(request.timing.total)}ms
        </span>
      ) : request.status === "pending" ? (
        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
          {formatRelativeTime(request.startedAt)}
        </span>
      ) : (
        <span className="w-12" />
      )}

      {/* Timestamp */}
      <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-text-muted">
        {formatAbsoluteTime(request.startedAt)}
      </span>
    </button>
  )
}
