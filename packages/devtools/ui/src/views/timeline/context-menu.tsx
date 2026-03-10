import { useRef, useEffect } from "react"
import { Copy, Terminal, Braces, Download, RotateCcw, Pin } from "lucide-react"

import type { RequestEntry } from "../../store"

import { getSocket } from "../../socket"
import { buildCurl, buildFetchSnippet, exportRequestAsJson, getRequestLabel } from "./request-helpers"

// ── Context Menu State ───────────────────────────────────────────────────────

export interface ContextMenuState {
  x: number
  y: number
  request: RequestEntry
}

// ── Context Menu ─────────────────────────────────────────────────────────────

export function RequestContextMenu({
  state,
  onClose,
  onTogglePin,
}: {
  state: ContextMenuState
  onClose: () => void
  onTogglePin: (id: string) => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [onClose])

  const { request } = state
  const label = getRequestLabel(request)

  function handleReplay() {
    const socket = getSocket()
    socket.emit("replay", {
      source: request.source,
      group: request.group,
      method: request.method,
      variables: request.variables,
      mode: request.mode,
    })
    onClose()
  }

  function handleDownload() {
    const blob = new Blob([exportRequestAsJson(request)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${label.replace(/\./g, "-")}-${request.id}.json`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  const items = [
    {
      icon: Copy,
      label: "Copy as cURL",
      action: () => {
        navigator.clipboard.writeText(buildCurl(request))
        onClose()
      },
    },
    {
      icon: Terminal,
      label: "Copy as fetch",
      action: () => {
        navigator.clipboard.writeText(buildFetchSnippet(request))
        onClose()
      },
    },
    {
      icon: Braces,
      label: "Copy as JSON",
      action: () => {
        navigator.clipboard.writeText(exportRequestAsJson(request))
        onClose()
      },
    },
    {
      icon: Download,
      label: "Download JSON",
      action: handleDownload,
    },
    {
      icon: RotateCcw,
      label: "Replay request",
      action: handleReplay,
    },
    {
      icon: Pin,
      label: request.pinned ? "Unpin" : "Pin",
      action: () => {
        onTogglePin(request.id)
        onClose()
      },
    },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-100 min-w-45 rounded-lg border border-border-default bg-surface-1 p-1 shadow-xl"
      style={{ left: state.x, top: state.y }}
    >
      <div className="mb-1 truncate border-b border-border-subtle px-2 py-1.5 text-[10px] font-medium text-text-muted">
        {label}
      </div>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <Icon size={12} className="shrink-0" />
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
