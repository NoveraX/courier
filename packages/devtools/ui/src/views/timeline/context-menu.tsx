import { Copy, Terminal, Braces, Download, RotateCcw, Pin } from "lucide-react"

import type { RequestEntry } from "../../store"
import { useDevToolsStore } from "../../store"
import { getSocket } from "../../socket"
import {
  ContextMenu, ContextMenuTrigger, ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator, ContextMenuLabel,
} from "@/components/ui/context-menu"

import { buildCurl, buildFetchSnippet, exportRequestAsJson, getRequestLabel } from "./request-helpers"

// ── Request Context Menu ────────────────────────────────────────────────────

export function RequestContextMenuWrapper({
  request, onTogglePin, children,
}: {
  request: RequestEntry
  onTogglePin: () => void
  children: React.ReactNode
}) {
  const label = getRequestLabel(request)

  function handleReplay() {
    const socket = getSocket()
    const { showToast } = useDevToolsStore.getState()
    socket.emit(
      "replay",
      {
        source: request.source,
        group: request.group,
        method: request.method,
        variables: request.variables,
        headers: request.requestHeaders ?? {},
        mode: request.mode,
      },
      (result: { ok: boolean; error?: string }) => {
        if (result.ok) {
          showToast("Replay sent — new request will appear in timeline", "success")
        } else {
          showToast(result.error ?? "Replay failed", "error")
        }
      },
    )
  }

  function handleDownload() {
    const blob = new Blob([exportRequestAsJson(request)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${label.replace(/\./g, "-")}-${request.id}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuLabel className="truncate text-xs text-muted-foreground">
          {label}
        </ContextMenuLabel>
        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => navigator.clipboard.writeText(buildCurl(request))}>
          <Copy /> Copy as cURL
        </ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(buildFetchSnippet(request))}>
          <Terminal /> Copy as fetch
        </ContextMenuItem>
        <ContextMenuItem onClick={() => navigator.clipboard.writeText(exportRequestAsJson(request))}>
          <Braces /> Copy as JSON
        </ContextMenuItem>
        <ContextMenuItem onClick={handleDownload}>
          <Download /> Download JSON
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={handleReplay}>
          <RotateCcw /> Replay request
        </ContextMenuItem>
        <ContextMenuItem onClick={onTogglePin}>
          <Pin /> {request.pinned ? "Unpin" : "Pin"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
