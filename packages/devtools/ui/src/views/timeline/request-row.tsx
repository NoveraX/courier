import { useState, useEffect } from "react"
import { Pin } from "lucide-react"

import type { RequestEntry, TimestampFormat } from "../../store"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import { formatRelativeTime, formatAbsoluteTime, formatSize } from "../../components/ui"
import { STATUS_CONFIG, HTTP_METHOD_COLORS, getCodeColor, TIMING_WARN_MS } from "./constants"
import { getRequestLabel } from "./request-helpers"

// ── Request Row ─────────────────────────────────────────────────────────────

export function RequestRow({
  request, selected, onSelect, onTogglePin,
  timestampFormat = "relative", slowThreshold = 1000,
}: {
  request: RequestEntry
  selected: boolean
  onSelect: () => void
  onTogglePin: () => void
  timestampFormat?: TimestampFormat
  slowThreshold?: number
}) {
  const [, setTick] = useState(0)
  const statusCfg = STATUS_CONFIG[request.status]
  const label = getRequestLabel(request)
  const codeColor = request.statusCode != null ? getCodeColor(request.statusCode) : ""
  const isError = request.status === "error" || request.status === "validation_error"

  // Tick every 10s for relative timestamps
  useEffect(() => {
    if (timestampFormat !== "relative" && request.status !== "pending") return
    const interval = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(interval)
  }, [request.status, timestampFormat])

  const formatTimestamp = timestampFormat === "relative" ? formatRelativeTime : formatAbsoluteTime

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect() }}
      className={cn(
        "group flex h-full w-full items-center gap-2 border-l-2 px-3 text-left text-xs transition-colors",
        selected
          ? "border-l-primary bg-accent"
          : isError
            ? "border-l-transparent bg-destructive/5 hover:bg-accent/50"
            : request.pinned
              ? "border-l-transparent bg-amber-500/5 hover:bg-accent/50"
              : "border-l-transparent hover:bg-accent/50",
      )}
    >
      {/* Status dot */}
      <div className="flex w-3 justify-center">
        <div className={cn("size-2 rounded-full", statusCfg.dotClass)} title={statusCfg.label} />
      </div>

      {/* HTTP method */}
      {request.httpMethod && (
        <span className={cn(
          "w-9 shrink-0 text-[10px] font-bold tabular-nums",
          HTTP_METHOD_COLORS[request.httpMethod] ?? "text-muted-foreground",
        )}>
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
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
        {label}
      </span>

      {/* Pinned indicator */}
      {request.pinned && <Pin className="size-2.5 shrink-0 fill-amber-400 text-amber-400" />}

      {/* Pin button (on hover) */}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={(e) => { e.stopPropagation(); onTogglePin() }}
        className={cn(
          "hidden size-5 group-hover:inline-flex",
          request.pinned ? "text-amber-400" : "text-muted-foreground",
        )}
        title={request.pinned ? "Unpin" : "Pin"}
      >
        <Pin className="size-2.5" />
      </Button>

      {/* Status code */}
      {request.statusCode != null && (
        <span className={cn("w-7 shrink-0 text-right text-[11px] font-medium tabular-nums", codeColor)}>
          {request.statusCode}
        </span>
      )}

      {/* Size */}
      {request.size != null && request.size > 0 && (
        <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
          {formatSize(request.size)}
        </span>
      )}

      {/* Duration */}
      <DurationCell request={request} slowThreshold={slowThreshold} />

      {/* Timestamp */}
      <span className="w-14 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {formatTimestamp(request.startedAt)}
      </span>
    </div>
  )
}

// ── Duration Cell ───────────────────────────────────────────────────────────

function DurationCell({ request, slowThreshold }: { request: RequestEntry; slowThreshold: number }) {
  if (request.timing) {
    return (
      <span className={cn(
        "w-12 shrink-0 text-right text-[11px] tabular-nums",
        request.timing.total > slowThreshold ? "text-red-400"
          : request.timing.total > TIMING_WARN_MS ? "text-amber-400"
            : "text-emerald-400",
      )}>
        {Math.round(request.timing.total)}ms
      </span>
    )
  }

  if (request.status === "pending") {
    return (
      <span className="w-12 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {formatRelativeTime(request.startedAt)}
      </span>
    )
  }

  return <span className="w-12" />
}
